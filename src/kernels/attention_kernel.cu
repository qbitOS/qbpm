#include "attention_kernel.h"

namespace qbpm::kernels {

__global__ void attention_scores_kernel(
    const float* q,
    const float* k,
    float* scores,
    int seq_len,
    int head_dim,
    float scale) {
  int i = blockIdx.x;
  int j = blockIdx.y;
  if (i >= seq_len || j >= seq_len) return;
  float dot = 0.f;
  for (int d = 0; d < head_dim; ++d) {
    dot += q[i * head_dim + d] * k[j * head_dim + d];
  }
  scores[i * seq_len + j] = scale * dot;
}

cudaError_t attention_scores_launch(
    const float* q,
    const float* k,
    float* scores,
    int seq_len,
    int head_dim,
    float scale) {
  dim3 grid(seq_len, seq_len);
  attention_scores_kernel<<<grid, 1>>>(q, k, scores, seq_len, head_dim, scale);
  return cudaGetLastError();
}

}  // namespace qbpm::kernels