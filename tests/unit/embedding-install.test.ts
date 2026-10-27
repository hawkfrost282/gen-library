import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  embeddingDownloadUrl,
  embeddingInstallBytes,
  embeddingModelsDirectory,
  inspectManagedEmbeddingInstall,
  installedSemanticModels,
  pinnedLlamaRuntimeUrl,
  resolveInstalledEmbeddingLayout,
  runtimeArchiveEntryAllowed,
  semanticModelPackageBytes,
  downloadEmbeddingFile,
  verifiedEmbeddingDownload,
  uninstallSemanticModelFiles,
} from "../../src/main/embedding-install";
import { EMBEDDING_GEMMA2_MODEL_REVISION } from "../../src/shared/embedding/profile";

describe("embedding install lookup", () => {
  it("treats a tier as installed only when both of its files are present", () => {
    expect(installedSemanticModels(new Set([
      "embeddinggemma-2-UD-Q4_K_XL.gguf",
      "mmproj-Q8_0.gguf",
    ]))).toEqual(["embeddinggemma-2-compact"]);
    expect(installedSemanticModels(new Set(["embeddinggemma-2-UD-Q4_K_XL.gguf"]))).toEqual([]);
  });

  it("reads only the files the installer writes into the app model directory", () => {
    const userData = mkdtempSync(path.join(tmpdir(), "serpent-embedding-"));
    const elsewhere = path.join(userData, "elsewhere");
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(path.join(elsewhere, "embeddinggemma-2-UD-Q4_K_XL.gguf"), "");
    writeFileSync(path.join(elsewhere, "mmproj-Q8_0.gguf"), "");
    writeFileSync(path.join(elsewhere, "llama-server.exe"), "");

    const missing = inspectManagedEmbeddingInstall(userData);
    expect(installedSemanticModels(new Set(missing.files.keys()))).toEqual([]);
    expect(missing.runtimeFound).toBe(false);

    const models = embeddingModelsDirectory(userData);
    mkdirSync(path.join(models, "runtime", "build"), { recursive: true });
    writeFileSync(path.join(models, "embeddinggemma-2-UD-Q4_K_XL.gguf"), "");
    writeFileSync(path.join(models, "mmproj-Q8_0.gguf"), "");
    writeFileSync(path.join(models, "runtime", "build", "llama-server.exe"), "");

    const found = inspectManagedEmbeddingInstall(userData);
    expect(installedSemanticModels(new Set(found.files.keys()))).toContain("embeddinggemma-2-compact");
    expect(found.runtimeFound).toBe(true);
    expect(resolveInstalledEmbeddingLayout(found, "embeddinggemma-2-compact", "win32")?.modelDirectory).toBe(models);
    expect(resolveInstalledEmbeddingLayout(found, "embeddinggemma-2-quality", "win32")).toBeNull();
  });

  it("builds the pinned download address", () => {
    expect(embeddingDownloadUrl("embeddinggemma-2-UD-Q4_K_XL.gguf")).toBe(
      `https://huggingface.co/unsloth/embeddinggemma-2-GGUF/resolve/${EMBEDDING_GEMMA2_MODEL_REVISION}/embeddinggemma-2-UD-Q4_K_XL.gguf`,
    );
    expect(pinnedLlamaRuntimeUrl("llama-b11457-bin-macos-arm64.tar.gz")).toMatch(/^https:\/\/github\.com\/ggml-org\/llama\.cpp\/releases\/download\/b11457\//);
    expect(runtimeArchiveEntryAllowed("../llama-server")).toBe(false);
    expect(runtimeArchiveEntryAllowed("build/bin/llama-server")).toBe(true);
  });

  it("reserves space for a missing runtime and resolves the installed compact layout", () => {
    expect(embeddingInstallBytes({
      modelId: "embeddinggemma-2-compact",
      alreadyFound: new Set(["embeddinggemma-2-UD-Q4_K_XL.gguf", "mmproj-Q8_0.gguf"]),
      runtimeFound: false,
      platform: "darwin",
      arch: "arm64",
    })).toBeGreaterThan(0);
    const root = mkdtempSync(path.join(tmpdir(), "serpent-embedding-layout-"));
    const models = embeddingModelsDirectory(root);
    mkdirSync(path.join(models, "runtime"), { recursive: true });
    writeFileSync(path.join(models, "embeddinggemma-2-UD-Q4_K_XL.gguf"), "");
    writeFileSync(path.join(models, "mmproj-Q8_0.gguf"), "");
    writeFileSync(path.join(models, "runtime", "llama-server"), "");
    const inspection = inspectManagedEmbeddingInstall(root);
    expect(resolveInstalledEmbeddingLayout(inspection, "embeddinggemma-2-compact", "darwin")?.modelDirectory).toBe(models);
    expect(resolveInstalledEmbeddingLayout(inspection, "embeddinggemma-2-quality", "darwin")).toBeNull();
  });
});


describe("embedding install download sizing", () => {
  it("quotes a compact package size for settings labels", () => {
    expect(semanticModelPackageBytes("embeddinggemma-2-compact")).toBeGreaterThan(600_000_000);
    expect(embeddingInstallBytes({
      modelId: "embeddinggemma-2-compact",
      alreadyFound: new Set(),
      runtimeFound: false,
      platform: "darwin",
      arch: "arm64",
    })).toBeGreaterThan(600_000_000);
  });

  it("fails closed without trying untrusted mirrors", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "gen-library-embed-dl-"));
    const destination = path.join(root, "llama.tar.gz");
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (input) => { urls.push(String(input)); return new Response("nope", { status: 502 }); }) as typeof fetch;
    try {
      await expect(downloadEmbeddingFile(pinnedLlamaRuntimeUrl("llama-b11457-bin-macos-arm64.tar.gz"), destination, { stallTimeoutMs: 200 })).rejects.toThrow();
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((url) => url.startsWith("https://github.com/ggml-org/llama.cpp/"))).toBe(true);
      expect(existsSync(destination)).toBe(false);
    } finally { globalThis.fetch = originalFetch; }
  });

  it("rejects truncated downloads before replacing an existing file", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "gen-library-integrity-"));
    const destination = path.join(root, "llama.tar.gz");
    writeFileSync(destination, "previous verified file");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200, headers: { "content-length": "4" } })) as typeof fetch;
    try {
      await expect(downloadEmbeddingFile(pinnedLlamaRuntimeUrl("llama-b11457-bin-macos-arm64.tar.gz"), destination)).rejects.toThrow();
      expect(readFileSync(destination, "utf8")).toBe("previous verified file");
    } finally { globalThis.fetch = originalFetch; }
  });

  it("rejects alternate hosts and unpinned revisions even with a known filename", () => {
    const official = pinnedLlamaRuntimeUrl("llama-b11457-bin-macos-arm64.tar.gz");
    expect(verifiedEmbeddingDownload(official).sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => verifiedEmbeddingDownload(official.replace("github.com", "example.com"))).toThrow();
    expect(() => verifiedEmbeddingDownload(official.replace("b11457/", "latest/"))).toThrow();
  });

});


describe("embedding uninstall", () => {
  it("removes model files under userData/embedding-models and keeps shared projectors when needed", () => {
    const root = mkdtempSync(path.join(tmpdir(), "serpent-embedding-uninstall-"));
    const models = path.join(root, "embedding-models");
    mkdirSync(models, { recursive: true });
    writeFileSync(path.join(models, "embeddinggemma-2-UD-Q4_K_XL.gguf"), "core");
    writeFileSync(path.join(models, "mmproj-Q8_0.gguf"), "proj");
    writeFileSync(path.join(models, "embeddinggemma-2-Q8_0.gguf"), "balanced");

    const removedCompact = uninstallSemanticModelFiles({
      modelId: "embeddinggemma-2-compact",
      userDataPath: root,
    });
    expect(removedCompact.removed.some((item) => item.endsWith("embeddinggemma-2-UD-Q4_K_XL.gguf"))).toBe(true);
    // Shared projector stays because balanced is still present.
    expect(removedCompact.removed.some((item) => item.endsWith("mmproj-Q8_0.gguf"))).toBe(false);
    expect(readFileSync(path.join(models, "mmproj-Q8_0.gguf"), "utf8")).toBe("proj");

    const removedBalanced = uninstallSemanticModelFiles({
      modelId: "embeddinggemma-2-balanced",
      userDataPath: root,
    });
    expect(removedBalanced.removed.some((item) => item.endsWith("embeddinggemma-2-Q8_0.gguf"))).toBe(true);
    expect(removedBalanced.removed.some((item) => item.endsWith("mmproj-Q8_0.gguf"))).toBe(true);
  });
});
