#pragma once

// CUDA attention stub — host API for qbpm kernel.cuda nodes.
// Target: C++23/26 host wrappers; device code stays nvcc-compatible.

#include <cuda_runtime.h>

namespace qbpm::kernels {

cudaError_t attention_scores_launch(
    const float* q,
    const float* k,
    float* scores,
    int seq_len,
    int head_dim,
    float scale);

}  // namespace qbpm::kernels