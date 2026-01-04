How would you like to authenticate?とauth0 loginで聞かれるが、As a userを選択したら期待動作した。もう一つの方は確かめていない。


Auth0から連携されたEventBridgeは手動で紐づける。
紐づけたものはdataリソースで参照させることで、他のリソースから利用できる。
https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudwatch_event_bus