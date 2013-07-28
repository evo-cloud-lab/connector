# Evo Cloud Cluster Network Connector

## Overview

This is Neuron based service which connects remote nodes to create a self-managed network.

## Install

```bash
npm install evo-connector
```

## How to Use

The following configuration properties are required:
- `id`: unique id of this node;
- `cluster`: name of cluster;
- `address`: the IP address used to identify this node;
- `port`: the port this node used to for communication;
- `broadcast`: this IP address for broadcasting messages.

Example:

```bash
evo-connector --cluster=myCloud1 --id=MACADDR --address=192.168.100.101 --port=680 --broadcast=192.168.255.255
```

## License

MIT/X11 License
