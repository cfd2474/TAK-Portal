<h1 align='center'>TAK Portal</h1>

<p align='center'>A lightweight user management portal designed to integrate with Authentik and TAK Server for streamlined user management.</p>


## Prerequisites
> [!NOTE]
> This docker container relies on Authentik for its user management and 
> a working TAK Server for proper certificate management.  TAK Portal will function without a connection to the TAK Server, but will not revoke certificates should a user be disabled or deleted.


## Installation
On an Unbuntu machine perform the following commands

```
git clone https://github.com/AdventureSeeker423/TAK-Portal
cd TAK-Portal
```

(Optional) To customize the port that the UI uses

```
./takportal config
```

To start TAK Portal

```
./takportal start
```


## Configuration

1. Navigate to the TAK Portal UI using the IP address your docker instance is running on and the assigned port number.  By default this is port 3000.  (ex. 192.168.1.150:3000)
2. Navigate to "Server Settings" found at the bottom of the sidebar.
3. Here you should set the URL to your Authentik instance as well as enter your Authentik API Token.
4. If connecting to a TAK server, enter your TAK URL, ensuring the proper port and leaving /Marti at the end.  You will also need to upload a webadmin.p12, tak-ca.pem cert, and the password for webadmin.  (Default is usually atakatka)
5. Click save at the bottom of the page


## Getting Started

1. Start by navigating to the "Manage Agencies" tab in the sidebar and by creating your first agency.