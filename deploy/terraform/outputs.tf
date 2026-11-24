output "public_ip" {
  description = "Fixed public address; the app is at http://<public_ip>:30000."
  value       = aws_eip.k8s.public_ip
}

output "private_ip" {
  description = "Address the Ansible server uses to reach the server inside the VPC."
  value       = aws_instance.k8s.private_ip
}

output "instance_id" {
  value = aws_instance.k8s.id
}

output "release" {
  description = "Commit recorded on the server by the last apply."
  value       = var.release
}
