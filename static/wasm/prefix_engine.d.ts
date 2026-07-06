/* tslint:disable */
/* eslint-disable */

export class WasmMatmul {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * C = A × B where A is [m×k], B is [k×n]
     */
    matmul(a: Float32Array, b: Float32Array, m: number, k: number, n: number): Float32Array;
    /**
     * Fused matmul + bias + relu
     */
    matmul_relu(x: Float32Array, w: Float32Array, bias: Float32Array, batch: number, ni: number, no: number): Float32Array;
    /**
     * Full MLP forward: input through all layers
     * arch_js: Uint32Array of layer dimensions [d0, d1, ..., dN]
     * layer_data: Float32Array of flattened [w0, b0, w1, b1, ...]
     */
    mlp_forward(input: Float32Array, layer_data: Float32Array, arch_js: Uint32Array): Float32Array;
    constructor();
}

export class WasmPrefixClassifier {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Classify a single line, returns JSON string
     */
    classify(line: string): string;
    /**
     * Get binary-packed prefix data as bytes
     */
    classify_binary(source: string): Uint8Array;
    /**
     * Classify entire source, returns JSON array string
     */
    classify_source(source: string): string;
    /**
     * Get prefix gutter lines as JSON array
     */
    gutter(source: string): string;
    constructor();
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmatmul_free: (a: number, b: number) => void;
    readonly __wbg_wasmprefixclassifier_free: (a: number, b: number) => void;
    readonly uvspeed_classify: (a: number, b: number) => number;
    readonly wasmmatmul_matmul: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly wasmmatmul_matmul_relu: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly wasmmatmul_mlp_forward: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly wasmprefixclassifier_classify: (a: number, b: number, c: number, d: number) => void;
    readonly wasmprefixclassifier_classify_binary: (a: number, b: number, c: number, d: number) => void;
    readonly wasmprefixclassifier_classify_source: (a: number, b: number, c: number, d: number) => void;
    readonly wasmprefixclassifier_gutter: (a: number, b: number, c: number, d: number) => void;
    readonly wasmprefixclassifier_new: () => number;
    readonly wasmmatmul_new: () => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
