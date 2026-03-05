# @azeth/cli

Command-line interface for Azeth.ai trust infrastructure. Deploy smart accounts, discover services, make x402 payments, and manage on-chain reputation.

## Installation

```bash
npm install -g @azeth/cli

# or use without installing:
npx @azeth/cli <command>
```

## Quick Start

```bash
# 1. Set environment variables
export AZETH_PRIVATE_KEY=0x...
export PIMLICO_API_KEY=...

# 2. Deploy account and register on the trust registry
azeth init --name "MyAgent" --type agent --description "Market data provider" --capabilities "price-feed,analytics"

# 3. Check account balances
azeth status

# 4. Discover services
azeth find --capability price-feed --min-rep 80

# 5. Call an x402 service (auto-pay + auto-feedback)
azeth call https://api.example.com/eth-price --max-amount 0.10
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AZETH_PRIVATE_KEY` | Yes | Account owner's private key |
| `PIMLICO_API_KEY` | Yes* | Pimlico bundler key (*required for state-changing ops) |
| `AZETH_CHAIN` | No | Default chain (`baseSepolia`) |
| `BASE_RPC_URL` | No | RPC endpoint URL |
| `AZETH_SERVER_URL` | No | Azeth server URL |

## Commands

| Command | Purpose | Key Options |
|---|---|---|
| `init` | Deploy account + register | `--name`, `--type`, `--capabilities` |
| `call <url>` | Auto-pay + auto-feedback | `--max-amount`, `--no-feedback` |
| `find [query]` | Advanced discovery | `--capability`, `--min-rep`, `--type` |
| `status` | Check balances | (none) |
| `skills list` | List capabilities | (none) |
| `skills add` | Add capabilities | `<capabilities...>` |
| `reputation show` | View reputation | `<agentId>` |
| `reputation give` | Submit reputation | `<agentId>`, `<rating>`, `--tag` |
| `agreements create` | Recurring payments | `--payee`, `--amount`, `--interval` |
| `register` | Registry registration | `--name`, `--type` |
| `discover` | Simple discovery | `--capability`, `--min-reputation` |
| `pay <url>` | Direct x402 payment | `--max-amount`, `--method` |

## Global Options

```
--chain <chain>       Chain: "base" or "baseSepolia" (default: baseSepolia)
--rpc-url <url>       Custom RPC URL
--server-url <url>    Azeth server URL
```

## Full Documentation

See [docs/cli.md](../../docs/cli.md) for complete command reference with all options, arguments, and example output.

## License

MIT
