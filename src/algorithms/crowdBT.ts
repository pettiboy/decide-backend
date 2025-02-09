// https://github.com/anishathalye/gavel/blob/master/gavel/crowd_bt.py

export const GAMMA = 0.1;
export const LAMBDA = 1;
export const KAPPA = 0.0001;
export const MU_PRIOR = 0;
export const SIGMA_SQ_PRIOR = 1;
export const ALPHA_PRIOR = 10;
export const BETA_PRIOR = 1;
export const EPSILON = 0.25;
// Compute the divergence between two Gaussians.
export function divergenceGaussian(
  mu1: number,
  sigmaSq1: number,
  mu2: number,
  sigmaSq2: number
): number {
  const ratio = sigmaSq1 / sigmaSq2;
  return ((mu1 - mu2) ** 2) / (2 * sigmaSq2) + (ratio - 1 - Math.log(ratio)) / 2;
}

// Lanczos approximation for log Gamma function.
function logGamma(z: number): number {
  const S = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < S.length; j++) {
    y += 1;
    ser += S[j] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Beta function logarithm using the Gamma function.
function betaln(alpha: number, beta: number): number {
  return logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);
}

// Digamma (psi) approximation.
function digamma(x: number): number {
  let result = 0;
  // Increase x to a large enough number so that the asymptotic expansion holds.
  while (x < 7) {
    result -= 1 / x;
    x++;
  }
  const f = 1 / (x * x);
  result += Math.log(x) - 0.5 / x - f / 12 + (f * f) / 120 - (f * f * f) / 252;
  return result;
}

// Compute the divergence between two Beta distributions.
export function divergenceBeta(
  alpha1: number,
  beta1: number,
  alpha2: number,
  beta2: number
): number {
  return (
    betaln(alpha2, beta2) -
    betaln(alpha1, beta1) +
    (alpha1 - alpha2) * digamma(alpha1) +
    (beta1 - beta2) * digamma(beta1) +
    (alpha2 - alpha1 + beta2 - beta1) * digamma(alpha1 + beta1)
  );
}

interface AnnotatorUpdate {
  updatedAlpha: number;
  updatedBeta: number;
  c: number;
}

// Returns the updated annotator parameters and probability (c)
function updatedAnnotator(
  alpha: number,
  beta: number,
  muWinner: number,
  sigmaSqWinner: number,
  muLoser: number,
  sigmaSqLoser: number
): AnnotatorUpdate {
  const expMuWinner = Math.exp(muWinner);
  const expMuLoser = Math.exp(muLoser);
  const sumExp = expMuWinner + expMuLoser;
  const c1 =
    expMuWinner / sumExp +
    0.5 *
      (sigmaSqWinner + sigmaSqLoser) *
      (expMuWinner * expMuLoser * (expMuLoser - expMuWinner)) /
      Math.pow(sumExp, 3);
  const c2 = 1 - c1;
  const c = (c1 * alpha + c2 * beta) / (alpha + beta);
  const expt =
    (c1 * (alpha + 1) * alpha + c2 * alpha * beta) /
    (c * (alpha + beta + 1) * (alpha + beta));
  const expt_sq =
    (c1 * (alpha + 2) * (alpha + 1) * alpha + c2 * (alpha + 1) * alpha * beta) /
    (c * (alpha + beta + 2) * (alpha + beta + 1) * (alpha + beta));
  const variance = expt_sq - expt * expt;
  const updatedAlpha = ((expt - expt_sq) * expt) / variance;
  const updatedBeta = ((expt - expt_sq) * (1 - expt)) / variance;
  return { updatedAlpha, updatedBeta, c };
}

interface MusUpdate {
  updatedMuWinner: number;
  updatedMuLoser: number;
}

// Returns the updated means for winner and loser.
function updatedMus(
  alpha: number,
  beta: number,
  muWinner: number,
  sigmaSqWinner: number,
  muLoser: number,
  sigmaSqLoser: number
): MusUpdate {
  const expMuWinner = Math.exp(muWinner);
  const expMuLoser = Math.exp(muLoser);
  const sumExp = expMuWinner + expMuLoser;
  const mult =
    (alpha * expMuWinner) / (alpha * expMuWinner + beta * expMuLoser) -
    expMuWinner / sumExp;
  const updatedMuWinner = muWinner + sigmaSqWinner * mult;
  const updatedMuLoser = muLoser - sigmaSqLoser * mult;
  return { updatedMuWinner, updatedMuLoser };
}

interface SigmaSqUpdate {
  updatedSigmaSqWinner: number;
  updatedSigmaSqLoser: number;
}

// Returns the updated variances for winner and loser.
function updatedSigmaSqs(
  alpha: number,
  beta: number,
  muWinner: number,
  sigmaSqWinner: number,
  muLoser: number,
  sigmaSqLoser: number
): SigmaSqUpdate {
  const expMuWinner = Math.exp(muWinner);
  const expMuLoser = Math.exp(muLoser);
  const sumExp = expMuWinner + expMuLoser;
  const numerator = alpha * expMuWinner * beta * expMuLoser;
  const denominator = Math.pow(alpha * expMuWinner + beta * expMuLoser, 2);
  const term1 = numerator / denominator;
  const term2 = (expMuWinner * expMuLoser) / Math.pow(sumExp, 2);
  const mult = term1 - term2;
  const updatedSigmaSqWinner = sigmaSqWinner * Math.max(1 + sigmaSqWinner * mult, KAPPA);
  const updatedSigmaSqLoser = sigmaSqLoser * Math.max(1 + sigmaSqLoser * mult, KAPPA);
  return { updatedSigmaSqWinner, updatedSigmaSqLoser };
}

export interface UpdateResult {
  updatedAlpha: number;
  updatedBeta: number;
  updatedMuWinner: number;
  updatedSigmaSqWinner: number;
  updatedMuLoser: number;
  updatedSigmaSqLoser: number;
}

// Performs a single update for a comparison where one candidate wins.
export function update(
  alpha: number,
  beta: number,
  muWinner: number,
  sigmaSqWinner: number,
  muLoser: number,
  sigmaSqLoser: number
): UpdateResult {
  const annotator = updatedAnnotator(alpha, beta, muWinner, sigmaSqWinner, muLoser, sigmaSqLoser);
  const mus = updatedMus(alpha, beta, muWinner, sigmaSqWinner, muLoser, sigmaSqLoser);
  const sigmaSqs = updatedSigmaSqs(alpha, beta, muWinner, sigmaSqWinner, muLoser, sigmaSqLoser);
  return {
    updatedAlpha: annotator.updatedAlpha,
    updatedBeta: annotator.updatedBeta,
    updatedMuWinner: mus.updatedMuWinner,
    updatedSigmaSqWinner: sigmaSqs.updatedSigmaSqWinner,
    updatedMuLoser: mus.updatedMuLoser,
    updatedSigmaSqLoser: sigmaSqs.updatedSigmaSqLoser,
  };
}

// Optionally, you can use this to compute the expected information gain from a potential comparison.
export function expectedInformationGain(
  alpha: number,
  beta: number,
  muA: number,
  sigmaSqA: number,
  muB: number,
  sigmaSqB: number
): number {
  const annotator1 = updatedAnnotator(alpha, beta, muA, sigmaSqA, muB, sigmaSqB);
  const mus1 = updatedMus(alpha, beta, muA, sigmaSqA, muB, sigmaSqB);
  const sigmaSqs1 = updatedSigmaSqs(alpha, beta, muA, sigmaSqA, muB, sigmaSqB);
  const probARankedAbove = annotator1.c;
  
  const annotator2 = updatedAnnotator(alpha, beta, muB, sigmaSqB, muA, sigmaSqA);
  const mus2 = updatedMus(alpha, beta, muB, sigmaSqB, muA, sigmaSqA);
  const sigmaSqs2 = updatedSigmaSqs(alpha, beta, muB, sigmaSqB, muA, sigmaSqA);
  
  return (
    probARankedAbove *
      (divergenceGaussian(
        mus1.updatedMuWinner,
        sigmaSqs1.updatedSigmaSqWinner,
        muA,
        sigmaSqA
      ) +
        divergenceGaussian(
          mus1.updatedMuLoser,
          sigmaSqs1.updatedSigmaSqLoser,
          muB,
          sigmaSqB
        ) +
        GAMMA * divergenceBeta(annotator1.updatedAlpha, annotator1.updatedBeta, alpha, beta)) +
    (1 - probARankedAbove) *
      (divergenceGaussian(
        mus2.updatedMuLoser,
        sigmaSqs2.updatedSigmaSqLoser,
        muA,
        sigmaSqA
      ) +
        divergenceGaussian(
          mus2.updatedMuWinner,
          sigmaSqs2.updatedSigmaSqWinner,
          muB,
          sigmaSqB
        ) +
        GAMMA * divergenceBeta(annotator2.updatedAlpha, annotator2.updatedBeta, alpha, beta))
  );
}