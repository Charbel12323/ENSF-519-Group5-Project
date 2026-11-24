# Deploying Boardly

Every merge to `main` is built and tested (unit tests, lint/typecheck/build and the Selenium suite), then deployed automatically if everything passes:

1. **Publish images**: Jenkins builds `boardly-backend` and `boardly-frontend` and pushes them to Docker Hub, tagged with the commit (for example `abc1234`) and `latest`.
2. **Provision server**: Jenkins copies this `deploy/` folder to the Ansible server over SSH and runs `terraform/run.sh apply`.
   Terraform makes sure the Kubernetes server exists and matches `terraform/*.tf`: on the first run it creates it, after that it only records the new commit on it, and it reverts anything changed by hand.
3. **Configure server**: Ansible connects to that server and installs Kubernetes ([k3s](https://k3s.io)) with `ansible/k8s-node.yml`.
   On a server that's already set up, every step is skipped.
4. **Run containers**: `ansible/deploy.yml` renders `k8s/*.yaml.j2` with the two new images, runs `kubectl apply`, waits for the rollout and smoke-tests the app.
   If the new version doesn't come up, it rolls back to the previous one and the Jenkins build fails.
5. **Kubernetes orchestration**: `ansible/orchestrate.yml` scales the backend to 2 pods, deletes one and waits for Kubernetes to replace it, prints the rollout history, then scales back to 1.
   The app stays up throughout.

If any test fails, nothing is pushed to Docker Hub and nothing is deployed.

## The server

| | |
| --- | --- |
| What | One EC2 `t3.small` (2 GB) running k3s on Ubuntu (the same image as the Ansible server), named `boardly-k8s` |
| Created by | `terraform/main.tf`, run from the Ansible server |
| App URL | `http://<public_ip>:30000` (an Elastic IP, so it survives restarts). `./run.sh output` prints it. |
| SSH | Only from the Ansible server: `ssh ubuntu@<private_ip>` (it has the key) |
| Firewall | 22 from the Ansible server, 30000 from anywhere |

Terraform's state, which records the server it created, is kept in `~/.boardly/terraform/` on the Ansible server.
`run.sh` also writes `~/.boardly/inventory.ini`, which is how the playbooks find the server.

## What runs in the cluster

Everything lives in the `boardly` namespace.

| Resource | Image | Notes |
| --- | --- | --- |
| `frontend` Deployment + NodePort Service | `<user>/boardly-frontend:<tag>` | Users open `http://<public_ip>:30000`. It also forwards `/api` to the backend. |
| `backend` Deployment + Service | `<user>/boardly-backend:<tag>` | Only reachable inside the cluster. Runs database migrations when it starts. |
| `postgres` StatefulSet + Service | `postgres:16-alpine` | One pod with a 1Gi volume on the server's disk. |
| `boardly-secrets` Secret | - | Database password and JWT secret. |

The manifests in `k8s/` and the Terraform files are the source of truth.
Don't change the server or the cluster by hand; the next deploy puts them back the way the files say.

## One-time setup

### Jenkins

| What | Type | Value |
| --- | --- | --- |
| `dockerhub-creds` | Credential: Username with password | Docker Hub username and an access token |
| `ansible-ssh-key` | Credential: SSH Username with private key | User and private key that can SSH into the Ansible server |
| `ANSIBLE_HOST` | Manage Jenkins > System > Global properties > Environment variables | Address of the Ansible server |

The Jenkins user also needs `ssh` and `tar`, which come with most Linux images.

### Ansible server

Do this as the user in `ansible-ssh-key`; everything lives in that user's home folder.

- Ansible and [Terraform](https://developer.hashicorp.com/terraform/install) installed.
- An IAM role attached to the instance that can manage EC2 (instances, security groups, key pairs, Elastic IPs).
  Check it with `aws sts get-caller-identity`.
- An SSH key at `~/.ssh/id_ed25519`. Terraform installs its public half on the server, and Ansible logs in with it.
  Create it with `ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`.
- The Ansible server must be in the account's default VPC, which is where the Kubernetes server is created.

`~/.boardly/` holds the database password, the JWT secret, the Terraform state and the inventory.
The secrets are generated on the first deploy. Back the folder up and don't delete it:
without the secrets the backend can't log in to the existing database, and without the state Terraform forgets the server and creates a second one.

The Docker Hub repositories must be public, or the cluster won't be able to pull the images.

## Running things by hand

On the Ansible server, from a copy of this folder (Jenkins keeps the last 5 in `~/boardly-deploy/<commit>/`):

```bash
./terraform/run.sh plan               # what Terraform would change
./terraform/run.sh output             # the server's addresses (and rewrites the inventory)
./terraform/run.sh destroy            # delete the server; the next deploy creates a new one

cd ansible
ansible-playbook -i ~/.boardly/inventory.ini k8s-node.yml
ansible-playbook -i ~/.boardly/inventory.ini deploy.yml \
  -e frontend_image=<user>/boardly-frontend:<tag> \
  -e backend_image=<user>/boardly-backend:<tag>
ansible-playbook -i ~/.boardly/inventory.ini orchestrate.yml
```

Any image tag that's on Docker Hub works with `deploy.yml`, so this is also how you go back to an older release.

Optional overrides for `deploy.yml`, each passed with `-e`:

| Variable | Default | Use |
| --- | --- | --- |
| `app_url` | `http://<public_ip>:30000`, from the inventory | Public URL used in email links and the Google sign-in redirect |
| `backend_replicas`, `frontend_replicas` | `1` | Number of pods |
| `auth_rate_limit` | `300` | Login and signup attempts per 15 minutes |

To use `kubectl` directly, SSH to the server from the Ansible server and run `sudo kubectl -n boardly get pods`.

## Recording a demo

To show the whole pipeline building the server from nothing, delete it first:

```bash
~/boardly-deploy/$(ls -1t ~/boardly-deploy | head -1)/terraform/run.sh destroy
```

Then push a commit to `main`. Terraform reports `4 to add`, Ansible installs k3s, and the app comes up on a new public IP (printed by the Provision server step).
That build takes about 10 minutes longer. The database starts empty, since it lived on the old server.

## Rollbacks

If a rollout or smoke test fails, `deploy.yml` runs `kubectl rollout undo` on both deployments and fails.
The next successful deploy brings the cluster back in line with the manifests.

Database migrations are never rolled back.
Keep migrations backward compatible with the version that's running: add columns and tables first, and only remove them in a later release.

## Capacity

The server is a `t3.small` with 2 GB of memory and a 2 GB swap file.
k3s uses about 600 MB, which leaves room for one pod each of Postgres, the backend and the frontend, plus the extra pod a rolling update or the orchestration step starts briefly.
Don't raise `backend_replicas` or `frontend_replicas` above 1 without moving to a bigger instance (`instance_type` in `terraform/variables.tf`); check with `sudo kubectl top node` first.

Everything runs on one machine, so a pod crash is handled by Kubernetes, but losing the instance means waiting for the next deploy to recreate it (with an empty database).
