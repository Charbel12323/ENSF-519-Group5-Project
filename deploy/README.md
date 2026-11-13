# Deploying Boardly

Every merge to `main` is deployed automatically:

1. Jenkins builds `boardly-backend` and `boardly-frontend` and pushes them to Docker Hub, tagged with the commit (for example `abc1234`) and `latest`.
2. Jenkins copies this `deploy/` folder to the Ansible server over SSH and runs `ansible/deploy.yml` with the two image names.
3. Ansible renders `k8s/*.yaml.j2` with those exact images and runs `kubectl apply` on the Kubernetes host (`ansible-node2`).
4. It waits for the rollout and smoke-tests the app.
   If the new version doesn't come up, it rolls back to the previous one and the Jenkins build fails.

Nothing is re-tested on `main`; that already happened in the PR.

## What runs in the cluster

Everything lives in the `boardly` namespace.

| Resource | Image | Notes |
| --- | --- | --- |
| `frontend` Deployment + NodePort Service | `<user>/boardly-frontend:<tag>` | Users open `http://<EC2 public IP>:30000`. It also forwards `/api` to the backend. |
| `backend` Deployment + Service | `<user>/boardly-backend:<tag>` | Only reachable inside the cluster. Runs database migrations when it starts. |
| `postgres` StatefulSet + Service | `postgres:16-alpine` | One pod with a 1Gi volume. |
| `boardly-secrets` Secret | - | Database password and JWT secret. |

The manifests in `k8s/` are the source of truth.
Don't change things in the cluster by hand; the next deploy puts them back the way the manifests say.

## One-time setup

### Jenkins

| What | Type | Value |
| --- | --- | --- |
| `dockerhub-creds` | Credential: Username with password | Docker Hub username and an access token |
| `ansible-ssh` | Credential: SSH Username with private key | User and private key that can SSH into the Ansible server |
| `ANSIBLE_HOST` | Manage Jenkins > System > Global properties > Environment variables | Address of the Ansible server |

The Jenkins user also needs `ssh` and `tar`, which come with most Linux images.

### Ansible server

- `ansible-node2` must be in the default inventory and reachable over SSH, with passwordless `sudo` (needed to read `/etc/kubernetes/admin.conf`).
- The database password and JWT secret are generated on the first deploy and kept in `~/.boardly/` on the Ansible server.
  Back that folder up and don't delete it: without it, the backend can no longer log in to the existing database.

### Kubernetes host

- The EC2 security group must allow inbound TCP 30000.
- The Docker Hub repositories must be public, or the cluster won't be able to pull the images.

## Running a deploy by hand

From the `deploy/ansible` folder on the Ansible server:

```bash
ansible-playbook deploy.yml \
  -e frontend_image=<user>/boardly-frontend:<tag> \
  -e backend_image=<user>/boardly-backend:<tag>
```

Any image tag that's on Docker Hub works, so this is also how you go back to an older release.

Optional overrides, each passed with `-e`:

| Variable | Default | Use |
| --- | --- | --- |
| `app_url` | `http://<public IP from EC2 metadata>:30000` | Public URL used in email links and the Google sign-in redirect |
| `backend_replicas`, `frontend_replicas` | `1` | Number of pods |
| `auth_rate_limit` | `300` | Login and signup attempts per 15 minutes |

## Rollbacks

If a rollout or smoke test fails, the playbook runs `kubectl rollout undo` on both deployments and fails.
The next successful deploy brings the cluster back in line with the manifests.

Database migrations are never rolled back.
Keep migrations backward compatible with the version that's running: add columns and tables first, and only remove them in a later release.

## Scaling

The frontend and backend start with 1 pod each.
To run 3, pass `-e backend_replicas=3 -e frontend_replicas=3`, or change the defaults in `ansible/deploy.yml`.
Check memory first with `kubectl top pods -n boardly` and `kubectl top node`.
A rolling update starts one extra pod before stopping an old one, so leave room for that.

All pods run on one machine.
3 replicas keep the app up if a pod crashes, but not if the EC2 instance goes down.
