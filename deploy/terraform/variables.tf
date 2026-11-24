# run.sh fills in region, ansible_cidr, ami_id and public_key_path from the Ansible server it runs on.

variable "region" {
  description = "AWS region for the server; the same one as the Ansible server."
  type        = string
}

variable "ansible_cidr" {
  description = "The Ansible server's private address as a /32. Only it may SSH into the server."
  type        = string

  validation {
    condition     = can(cidrhost(var.ansible_cidr, 0))
    error_message = "ansible_cidr must be a CIDR block, for example 172.31.20.56/32."
  }
}

variable "ami_id" {
  description = "Image the server is launched from. run.sh passes the Ansible server's own (Ubuntu) image."
  type        = string

  validation {
    condition     = startswith(var.ami_id, "ami-")
    error_message = "ami_id must be an AMI ID, for example ami-0f441bd6af0596ef7."
  }
}

variable "public_key_path" {
  description = "Public half of the SSH key Ansible logs in with."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "instance_type" {
  description = "t3.small (2 GB) fits k3s plus one pod each of Postgres, the backend and the frontend."
  type        = string
  default     = "t3.small"
}

variable "node_port" {
  description = "Port the frontend is published on; must match node_port in ../ansible/deploy.yml."
  type        = number
  default     = 30000
}

variable "release" {
  description = "Commit being deployed, recorded as the server's Release tag."
  type        = string
  default     = "manual"
}
