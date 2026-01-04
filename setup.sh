mise use -g aqua
mise install

cp auth0/terraform.tfvars.example auth0/terraform.tfvars
cp aws/terraform.tfvars.example aws/terraform.tfvars

bash init-auth0.sh
bash init-aws.sh