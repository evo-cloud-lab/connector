# Evo Cloud Neural Network Central Cords

## Overview

This is Neuron based service which behaves like central cords in a neural network.
It helps build up a self-managed network for Evo Cloud.

## Install

```bash
npm install evo-cords
```

## How to Use

The following configuration properties are required:
- `name`: unique name of the cluster;
- `address`: the IP address used to identify this node;
- `port`: the port this node used to for communication.

Example:

```bash
node cords.js --name myCloud1 --address 192.168.100.101 --port 680
```

## License

MIT/X11 License
