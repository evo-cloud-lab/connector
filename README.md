# Evo Cloud Cluster Network Connector

## Overview

This is Neuron based service which connects remote nodes to create a self-managed network.

## Install

```bash
npm install evo-connector
```

## How to Use

The following configuration properties are required:
- `name`: unique name of the cluster;
- `address`: the IP address used to identify this node;
- `port`: the port this node used to for communication.

Example:

```bash
node connector.js --name myCloud1 --address 192.168.100.101 --port 680
```

## License

MIT/X11 License
