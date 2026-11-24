# The server Boardly runs on: one EC2 instance with k3s (a lightweight Kubernetes), set up by
# ../ansible/k8s-node.yml. Terraform owns it, so every deploy puts it back the way these files describe:
# a server that was deleted is recreated, and settings that were changed by hand are reverted.
#
# Don't run terraform here directly; use ./run.sh on the Ansible server (it keeps the state in one place).

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "boardly"
      ManagedBy = "terraform"
    }
  }
}

# The Ansible server sits in the default VPC and reaches the new server over its private address.
data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "k8s" {
  name        = "boardly-k8s"
  description = "Boardly Kubernetes server"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH from the Ansible server only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ansible_cidr]
  }

  ingress {
    description = "The app, on the frontend NodePort"
    from_port   = var.node_port
    to_port     = var.node_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Everything out: packages, k3s and the Docker Hub images"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_key_pair" "ansible" {
  key_name   = "boardly-ansible"
  public_key = file(pathexpand(var.public_key_path))
}

resource "aws_instance" "k8s" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.ansible.key_name
  vpc_security_group_ids = [aws_security_group.k8s.id]

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
  }

  # Only token-based (IMDSv2) access to the metadata service; deploy.yml reads the public IP that way.
  metadata_options {
    http_tokens = "required"
  }

  tags = {
    Name = "boardly-k8s"
    # The commit last deployed to this server. It changes on every deploy, which Terraform applies in place.
    Release = var.release
  }

  lifecycle {
    # Changing the image would replace the server (and wipe the cluster and its database), so a running
    # server keeps the image it was created with, even if the Ansible server is rebuilt from a newer one.
    ignore_changes = [ami]
  }
}

# A fixed public address, so the app's URL survives the server being stopped and started.
resource "aws_eip" "k8s" {
  domain   = "vpc"
  instance = aws_instance.k8s.id

  tags = {
    Name = "boardly-k8s"
  }
}
