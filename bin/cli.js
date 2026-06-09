#!/usr/bin/env node
/**
 * gpusmarket-host — List your GPU on GPUsMarket in one command.
 * Copyright (c) 2026 Tyga.Cloud Ltd. All rights reserved.
 * Author: Joe Wee <joe@tyga.cloud>
 *
 * Usage:
 *   npx gpusmarket-host --key gph_abc123                              # Auto-detect, Ollama
 *   npx gpusmarket-host --key gph_abc123 --backend llama-cpp          # Use llama.cpp
 *   npx gpusmarket-host --key gph_abc123 --model qwen3:32b            # Specific model
 *   npx gpusmarket-host --key gph_abc123 --backend llama-cpp --model Qwen/Qwen3-32B-GGUF:qwen3-32b-q4_k_m.gguf
 */

const { detectGpu } = require('../dist/detect');
const { recommend, parseModelArg } = require('../dist/recommend');
const { installOllama, installLlamaCpp } = require('../dist/installer');
const { pullOllamaModel, downloadGGUF } = require('../dist/modelPuller');
const { startOllama, startLlamaServer, getEndpoint, cleanup } = require('../dist/serverManager');
const { connect } = require('../dist/tunnel');

const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf('--' + name);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}

function hasFlag(name) {
  return args.includes('--' + name);
}

function log(msg) { process.stdout.write(`${msg}\n`); }

// ── Help ──
if (hasFlag('help') || hasFlag('h')) {
  log(`
  gpusmarket-host — List your GPU on GPUsMarket in one command.

  Usage:
    npx gpusmarket-host --key gph_abc123                    Auto-detect GPU, install Ollama, pull best model, connect
    npx gpusmarket-host --key gph_abc123 --backend llama-cpp   Use llama.cpp (better performance)
    npx gpusmarket-host --key gph_abc123 --model qwen3:32b     Use specific model

  Options:
    --key <key>         Host key from gpusmarket.com/host/setup (required)
    --backend <type>    Inference backend: ollama (default) or llama-cpp
    --model <name>      Model to serve (auto-recommended if omitted)
    --server <url>      Relay server (default: wss://gpusmarket.com/tunnel/ws)
    --port <port>       Server port (default: 11434 for Ollama, 8080 for llama-cpp)
    --dry-run           Show what would happen without executing
    --no-install        Skip auto-install (fail if backend not found)
    --no-pull           Skip model download
    --help              Show this help

  Examples:
    npx gpusmarket-host --key gph_abc123
    npx gpusmarket-host --key gph_abc123 --backend llama-cpp
    npx gpusmarket-host --key gph_abc123 --model llama3.3:70b
    npx gpusmarket-host --key gph_abc123 --backend llama-cpp --model Qwen/Qwen3-32B-GGUF:qwen3-32b-q4_k_m.gguf

  Get your host key at https://gpusmarket.com/host/setup
`);
  process.exit(0);
}

// ── Main ──
(async () => {
  const key = getFlag('key');
  const backend = getFlag('backend') || 'ollama';
  const modelArg = getFlag('model');
  const server = getFlag('server');
  const port = getFlag('port') ? parseInt(getFlag('port')) : null;
  const dryRun = hasFlag('dry-run');
  const noInstall = hasFlag('no-install');
  const noPull = hasFlag('no-pull');

  log('');
  log('  \x1b[1mgpusmarket-host\x1b[0m v1.0.0');
  log('');

  // Validate key
  if (!key || key === true) {
    log('  \x1b[31m\u2717\x1b[0m Missing --key flag. Get your host key at https://gpusmarket.com/host/setup');
    process.exit(1);
  }

  if (!key.startsWith('gph_')) {
    log('  \x1b[31m\u2717\x1b[0m Invalid key format. Host keys start with gph_');
    process.exit(1);
  }

  // Step 1: Detect GPU
  log('  Detecting GPU...');
  const gpu = detectGpu();
  if (gpu.gpu) {
    const vramLabel = gpu.vramGb ? ` (${gpu.vramGb}GB${gpu.platform === 'darwin' ? ' unified' : ' VRAM'})` : '';
    log(`  \x1b[32m\u2713\x1b[0m ${gpu.gpu}${vramLabel}`);
  } else {
    log('  \x1b[33m!\x1b[0m Could not detect GPU (will still work, model recommendation may be off)');
    gpu.vramGb = 8; // conservative default
  }
  log('');

  // Step 2: Determine model
  let modelInfo;
  if (modelArg) {
    modelInfo = parseModelArg(modelArg, backend);
  } else {
    modelInfo = recommend(gpu.vramGb, backend);
    log(`  Recommended model: \x1b[1m${modelInfo.label}\x1b[0m (fits in ${gpu.vramGb}GB)`);
    if (modelInfo.extras && modelInfo.extras.length > 0) {
      log(`  Popular extras:    ${modelInfo.extras.join(', ')}`);
    }
  }

  const backendLabel = backend === 'llama-cpp' ? 'llama.cpp' : 'Ollama';
  log(`  Backend: \x1b[1m${backendLabel}\x1b[0m${backend === 'ollama' ? ' (use --backend llama-cpp for raw performance)' : ''}`);
  log('');

  if (dryRun) {
    log('  \x1b[33m[DRY RUN]\x1b[0m Would execute:');
    log(`    1. Install ${backendLabel} (if needed)`);
    if (backend === 'llama-cpp') {
      log(`    2. Download GGUF: ${modelInfo.gguf}`);
      log(`    3. Start llama-server on port ${port || 8080}`);
    } else {
      log(`    2. Pull model: ollama pull ${modelInfo.model}`);
      log(`    3. Start Ollama on port ${port || 11434}`);
    }
    log(`    4. Connect tunnel to GPUsMarket with key ${key.substring(0, 12)}...`);
    log('');
    process.exit(0);
  }

  // Step 3: Install backend
  try {
    if (backend === 'llama-cpp') {
      if (noInstall) {
        const { isInstalled } = require('../dist/detect');
        if (!isInstalled('llama-server')) {
          log('  \x1b[31m\u2717\x1b[0m llama-server not found and --no-install set');
          process.exit(1);
        }
      } else {
        await installLlamaCpp();
      }
    } else {
      if (noInstall) {
        const { isInstalled } = require('../dist/detect');
        if (!isInstalled('ollama')) {
          log('  \x1b[31m\u2717\x1b[0m Ollama not found and --no-install set');
          process.exit(1);
        }
      } else {
        await installOllama();
      }
    }
  } catch (err) {
    log(`  \x1b[31m\u2717\x1b[0m ${err.message}`);
    process.exit(1);
  }
  log('');

  // Step 4: Pull/download model + popular extras
  if (!noPull) {
    try {
      if (backend === 'llama-cpp') {
        const ggufPath = await downloadGGUF(modelInfo.gguf);
        modelInfo._ggufPath = ggufPath;
      } else {
        await pullOllamaModel(modelInfo.model);
        // Pull popular extras (best-effort, don't fail if one doesn't work)
        if (modelInfo.extras && modelInfo.extras.length > 0 && !modelArg) {
          log('');
          log('  Pulling popular models renters want...');
          for (const extra of modelInfo.extras) {
            try { await pullOllamaModel(extra); } catch { log(`  \x1b[33m!\x1b[0m Skipped ${extra}`); }
          }
        }
      }
    } catch (err) {
      log(`  \x1b[31m\u2717\x1b[0m Model download failed: ${err.message}`);
      process.exit(1);
    }
    log('');
  }

  // Step 5: Start inference server
  let serverPort;
  try {
    if (backend === 'llama-cpp') {
      serverPort = await startLlamaServer(modelInfo._ggufPath || modelInfo.gguf, {
        port: port || 8080,
        alias: modelInfo.alias,
      });
    } else {
      serverPort = await startOllama();
    }
  } catch (err) {
    log(`  \x1b[31m\u2717\x1b[0m Server failed to start: ${err.message}`);
    process.exit(1);
  }
  log('');

  // Step 6: Connect tunnel
  const endpoint = getEndpoint(backend, serverPort);
  const ws = connect(key, endpoint, {
    server,
    gpu: gpu.gpu,
    backend,
  });

  // Graceful shutdown
  function shutdown() {
    log('\n  Shutting down...');
    if (ws && ws.readyState === 1) ws.close();
    cleanup();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch(err => {
  log(`  \x1b[31m\u2717\x1b[0m Fatal error: ${err.message}`);
  cleanup();
  process.exit(1);
});
