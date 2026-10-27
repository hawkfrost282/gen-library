/** Reviewed October 27, 2026. Pinned first-party GitHub release digests and Hugging Face LFS OIDs.
 * Runtime: https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b11457
 * Models: unsloth/embeddinggemma-2-GGUF at 412430755667d84b1ac64fe1fe2693aa6219f1d9.
 * Update these pins deliberately when changing the runtime/model revision. */
export const EMBEDDING_DOWNLOAD_INTEGRITY: Readonly<Record<string, { sha256: string; bytes: number }>> = {
  "llama-b11457-bin-macos-arm64.tar.gz": {
    "sha256": "e234070cbde0c8b0d30f79fa08ff8246abe22c72acb752619349b8d9c46f7839",
    "bytes": 12007659
  },
  "llama-b11457-bin-macos-x64.tar.gz": {
    "sha256": "f807f15aa0d4d9947b9befd06b3ff4bd8ddd30775d7b4b4505c8d3c5f33f0014",
    "bytes": 11525345
  },
  "llama-b11457-bin-win-cpu-arm64.zip": {
    "sha256": "fab992671bd26ba4117da4f70f330fe1b9fe69eb8ce952281cabf4c5c5f2a17e",
    "bytes": 12264648
  },
  "llama-b11457-bin-win-cuda-12.4-x64.zip": {
    "sha256": "c901dbb473c9472288e38ef06bf85e4e13d7de6bb24732b03dbe8aa05fcc483c",
    "bytes": 264528387
  },
  "embeddinggemma-2-BF16.gguf": {
    "sha256": "f315cbbb30dd487e44d501c8902abe88808755e43753a96beed1964f0a48aa4f",
    "bytes": 557950240
  },
  "embeddinggemma-2-Q8_0.gguf": {
    "sha256": "6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc",
    "bytes": 309855520
  },
  "embeddinggemma-2-UD-Q4_K_XL.gguf": {
    "sha256": "ea905fd08e8061db77a0031cbb5096d459d7cfd2bdd0ad2ba66e483f16719493",
    "bytes": 175673856
  },
  "mmproj-BF16.gguf": {
    "sha256": "995aaa56e88b9b631f651861d659b728a625ccc02a238be37cff56cf11dc0032",
    "bytes": 982074880
  },
  "mmproj-Q8_0.gguf": {
    "sha256": "90e7b0238009e2954f856f2081dcf7f35af026b64c765e98f4777053e1754460",
    "bytes": 554821120
  }
};
