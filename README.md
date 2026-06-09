# gpusmarket-host

List your GPU on [GPUsMarket](https://gpusmarket.com) in one command.

Auto-detects your GPU, installs the inference backend, pulls the best model for your hardware, and connects to the marketplace. You start earning.

## Quick Start

```bash
npx gpusmarket-host --key gph_your_key
```

Get your host key at [gpusmarket.com/host/setup](https://gpusmarket.com/host/setup).

## What It Does

1. Detects your GPU (NVIDIA, Apple Silicon, AMD)
2. Installs Ollama or llama.cpp (if not present)
3. Pulls the best model for your VRAM
4. Starts the inference server
5. Connects a secure tunnel to GPUsMarket
6. Your GPU is live and earning

## Options

```
--key <key>         Host key from gpusmarket.com/host/setup (required)
--backend <type>    ollama (default) or llama-cpp
--model <name>      Specific model (auto-recommended if omitted)
--port <port>       Server port (default: 11434 / 8080)
--dry-run           Show plan without executing
--no-install        Skip backend installation
--no-pull           Skip model download
```

## Examples

```bash
# Default — Ollama, auto-detect everything
npx gpusmarket-host --key gph_abc123

# Use llama.cpp for better raw performance
npx gpusmarket-host --key gph_abc123 --backend llama-cpp

# Specific model
npx gpusmarket-host --key gph_abc123 --model qwen3:32b

# llama.cpp with specific GGUF
npx gpusmarket-host --key gph_abc123 --backend llama-cpp --model Qwen/Qwen3-32B-GGUF:qwen3-32b-q4_k_m.gguf
```

## Requirements

- Node.js 18+
- macOS or Linux
- A GPU (NVIDIA, Apple Silicon, or AMD)

## License

Proprietary - Copyright (c) 2026 Tyga.Cloud Ltd. All rights reserved. See LICENSE file.
