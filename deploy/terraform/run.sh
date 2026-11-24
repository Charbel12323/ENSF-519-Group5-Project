#!/usr/bin/env bash
# Runs Terraform for the Boardly Kubernetes server. Run it on the Ansible server:
#
#   ./run.sh apply <release>   create the server, or put it back the way the .tf files describe
#   ./run.sh plan              show what apply would change, without changing anything
#   ./run.sh destroy           delete the server; the next deploy creates a new one
#   ./run.sh output            print the server's addresses
#
# Jenkins runs `apply` on every deploy to main, with the commit as the release.
#
# The .tf files are copied to ~/.boardly/terraform and Terraform runs there, so the state and the
# downloaded AWS provider are kept between deploys (each deploy unpacks into a new folder).
# terraform.tfstate is how Terraform knows it already created the server: if it's lost, the next apply
# creates a second server. Back up ~/.boardly.
#
# After apply and output it writes ~/.boardly/inventory.ini, the Ansible inventory for the server.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work="$HOME/.boardly/terraform"
inventory="$HOME/.boardly/inventory.ini"
ssh_key="$HOME/.ssh/id_ed25519"

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}
[ $# -ge 1 ] || usage

if [ ! -f "$ssh_key.pub" ]; then
  echo "Missing $ssh_key.pub. Create it with: ssh-keygen -t ed25519 -N '' -f $ssh_key" >&2
  exit 1
fi

mkdir -p "$work"
chmod 700 "$HOME/.boardly"
rm -f "$work"/*.tf
cp "$here"/*.tf "$work"/
if [ -f "$here/.terraform.lock.hcl" ]; then
  cp "$here/.terraform.lock.hcl" "$work"/
fi
cd "$work"

# This machine's region and private address, from the EC2 metadata service.
token=$(curl -sf -m 3 -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
metadata() { curl -sf -m 3 -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/$1"; }

export TF_IN_AUTOMATION=1
# Plain output: the Jenkins log doesn't render colors.
export TF_CLI_ARGS="-no-color"
export TF_VAR_region="${AWS_REGION:-$(metadata placement/region)}"
export TF_VAR_ansible_cidr="$(metadata local-ipv4)/32"
export TF_VAR_public_key_path="$ssh_key.pub"

# The release currently recorded on the server, so plan and destroy don't show a tag change.
current_release() {
  terraform output -raw release 2>/dev/null || echo manual
}

write_inventory() {
  local private_ip public_ip
  private_ip=$(terraform output -raw private_ip)
  public_ip=$(terraform output -raw public_ip)
  (
    umask 077
    cat > "$inventory" <<EOF
# Written by deploy/terraform/run.sh; it is overwritten on every deploy.
[boardly_k8s]
boardly-k8s ansible_host=$private_ip

[boardly_k8s:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=$ssh_key
# The server gets a new host key whenever Terraform replaces it, and only this machine can reach it
# (inside the VPC), so the host key isn't pinned.
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
app_url=http://$public_ip:30000
EOF
  )
  echo
  echo "Server:  $private_ip (private), $public_ip (public)"
  echo "App URL: http://$public_ip:30000"
  echo "Ansible inventory: $inventory"
}

terraform init -input=false >/dev/null

case "$1" in
  apply)
    release="${2:?Usage: run.sh apply <release>}"
    terraform apply -input=false -auto-approve -var "release=$release"
    write_inventory
    ;;
  plan)
    terraform plan -input=false -var "release=$(current_release)"
    ;;
  destroy)
    # Asks for confirmation.
    terraform destroy -var "release=$(current_release)"
    rm -f "$inventory"
    ;;
  output)
    terraform output
    write_inventory
    ;;
  *)
    usage
    ;;
esac
