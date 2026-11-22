// Transcrição de fala para legendas, com Whisper rodando no próprio aparelho.
import { pipeline, env } from '../vendor/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/', import.meta.url).href;
env.backends.onnx.wasm.proxy = false;

let asr = null, loadedModel = null;

self.onmessage = async (e) => {
  const { audio, model, language } = e.data;
  try {
    if (!asr || loadedModel !== model) {
      asr = await pipeline('automatic-speech-recognition', model, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, progress: p.progress || 0 });
        },
      });
      loadedModel = model;
    }
    self.postMessage({ type: 'status', text: 'Transcrevendo…' });
    const out = await asr(audio, {
      language: language || 'portuguese', task: 'transcribe',
      return_timestamps: true, chunk_length_s: 30, stride_length_s: 5,
    });
    self.postMessage({ type: 'done', chunks: out.chunks || [{ timestamp: [0, audio.length / 16000], text: out.text }] });
  } catch (err) {
    self.postMessage({ type: 'error', text: String(err && err.message || err) });
  }
};
