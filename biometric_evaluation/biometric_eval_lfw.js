#!/usr/bin/env node
'use strict';

// Must be loaded before face-api.js to enable native TensorFlow.js backend
require('@tensorflow/tfjs-node');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Canvas, Image, ImageData } = require('canvas');

// --- PATHS ---
const ROOT = path.resolve(__dirname, '..');
const EVAL = __dirname;
const PAIRS = path.join(EVAL, 'pairs.csv');
const DATASET = path.join(ROOT, 'lfw_images');
const MODELS = path.join(ROOT, 'frontend', 'public', 'models');
const CACHE = path.join(EVAL, 'cache');
const RESULTS = path.join(EVAL, 'results');
const REPORT = path.join(EVAL, 'report');

const BASELINE = 0.60;
const THRESHOLDS = Array.from({ length: 121 }, (_, i) => i / 100);
const REQUIRED = ['pair_id', 'fold_id', 'fold_position', 'is_same', 'image_a', 'image_b', 'image_a_path', 'image_b_path'];
const PIPELINE_VERSION = 'v2-content-hash-models-baseline-thresholds';

// --- UTILITIES ---
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function identityFromFilename(filename) {
    const m = filename.match(/_(\d+)\.jpg$/i);
    return m ? filename.slice(0, m.index) : filename.replace(/\.jpg$/i, '');
}

// Resolve a CSV-stored image path to an on-disk path within `datasetRoot`.
// pairs.csv stores `images/NNN/<filename>`; this LFW layout stores `<identity>/<filename>`.
// Falls back to the canonical identity/filename layout when the CSV path is absent.
function resolveImage(csvPath, datasetRoot) {
    datasetRoot = datasetRoot || DATASET;
    const candidate = path.resolve(datasetRoot, csvPath);
    if (isInsideDirectory(datasetRoot, candidate) && fs.existsSync(candidate)) {
        return { resolvedPath: candidate, method: 'csv' };
    }
    const filename = path.basename(csvPath);
    const identity = identityFromFilename(filename);
    const fallback = path.resolve(datasetRoot, identity, filename);
    if (isInsideDirectory(datasetRoot, fallback) && fs.existsSync(fallback)) {
        return { resolvedPath: fallback, method: 'identity' };
    }
    return { resolvedPath: candidate, method: 'missing' };
}

// Cache config hash over model file contents + pipeline version + pipeline params.
// Changing any model file, BASELINE, or THRESHOLDS invalidates cached descriptors.
function computeModelConfigHash(modelsDir) {
    const files = fs.readdirSync(modelsDir)
        .filter(f => fs.statSync(path.join(modelsDir, f)).isFile())
        .sort();
    const modelConfigStr = files
        .map(f => `${f}:${sha256(fs.readFileSync(path.join(modelsDir, f)))}`)
        .join('|');
    return sha256(`pipeline:${PIPELINE_VERSION}|face-api.js|ssdMobilenetv1|faceLandmark68Net|faceRecognitionNet|baseline:${BASELINE}|thresholds:${THRESHOLDS.length}|${modelConfigStr}`);
}

// Identity-independence audit for one fold vs its training folds.
// Returns { testIdentityCount, trainIdentityCount, identityOverlapCount }.
function identityOverlap(testRows, trainRows) {
    const testIds = new Set();
    for (const r of testRows) { testIds.add(r.identity_a); testIds.add(r.identity_b); }
    const trainIds = new Set();
    for (const r of trainRows) { trainIds.add(r.identity_a); trainIds.add(r.identity_b); }
    let overlap = 0;
    for (const id of testIds) if (trainIds.has(id)) overlap++;
    return { testIdentityCount: testIds.size, trainIdentityCount: trainIds.size, identityOverlapCount: overlap };
}

// FIX 1A: Bulletproof Path Validation
function isInsideDirectory(parent, target) {
    const rel = path.relative(parent, target);
    return rel !== '' &&
        rel !== '..' &&
        !rel.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(rel);
}

function csvLine(values) {
    return values.map(v => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',');
}

function writeCsv(file, headers, rows) {
    fs.writeFileSync(file, [csvLine(headers), ...rows.map(r => csvLine(headers.map(h => r[h]))), ''].join('\n'));
}

function parseCsv(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') quoted = false;
            else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(cell); cell = ''; }
        else if (c === '\n') { row.push(cell); if (row.some(x => x !== '')) rows.push(row); row = []; cell = ''; }
        else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const headers = rows.shift() || [];
    return rows.map(a => Object.fromEntries(headers.map((h, i) => [h, a[i] ?? ''])));
}

function metric(n, d) { return d ? n / d : null; }

function metrics(rows, threshold) {
    const valid = rows.filter(r => Number.isFinite(r.distance));
    let tp = 0, tn = 0, fp = 0, fn = 0;
    for (const r of valid) {
        const pred = r.distance <= threshold;
        if (r.is_same === 1) pred ? tp++ : fn++;
        else pred ? fp++ : tn++;
    }
    const p = tp + fn, n = tn + fp;
    return {
        threshold, tp, tn, fp, fn,
        far: metric(fp, n), frr: metric(fn, p),
        tar: metric(tp, p), tnr: metric(tn, n),
        accuracy: metric(tp + tn, p + n),
        precision: metric(tp, tp + fp),
        f1: metric(2 * tp, 2 * tp + fp + fn),
        valid_genuine: p, valid_impostor: n, valid_pairs: valid.length
    };
}

// FIX 1C: Strict FRR Constraint Handling
// The FRR <= 0.10 threshold-selection rule is an operational heuristic for this experiment,
// not a clinical, regulatory, or security requirement.
function chooseThreshold(rows) {
    const candidates = THRESHOLDS.map(t => metrics(rows, t)).filter(m => m.valid_genuine > 0 && m.valid_impostor > 0);
    if (!candidates.length) return { status: 'single_class', threshold: null };
    
    const constrained = candidates.filter(m => m.frr !== null && m.frr <= 0.10);
    if (!constrained.length) return { status: 'frr_constraint_unsatisfiable', threshold: null };

    return { status: 'constraint_satisfied', ...constrained.sort((a, b) => (a.far - b.far) || (a.frr - b.frr) || (b.tar - a.tar))[0] };
}

// FIX 1D: Mathematically Correct EER Interpolation
function eer(rows) {
    const curve = THRESHOLDS.map(t => metrics(rows, t)).filter(m => m.far !== null && m.frr !== null && m.valid_genuine > 0 && m.valid_impostor > 0);
    let best = null;
    for (let i = 0; i < curve.length; i++) {
        const a = curve[i], d = Math.abs(a.far - a.frr);
        if (!best || d < best.d) best = { d, a, b: null };
        if (i) {
            const b = curve[i - 1];
            if ((a.far - a.frr) * (b.far - b.frr) < 0) {
                const wa = Math.abs(b.far - b.frr);
                const wb = Math.abs(a.far - a.frr);
                const total = wa + wb;
                
                const interpolatedEER = (b.far * wb + a.far * wa) / total;
                const interpolatedThreshold = (b.threshold * wb + a.threshold * wa) / total;
                
                best = { 
                    d: 0, a, b, 
                    eer: interpolatedEER, 
                    threshold: interpolatedThreshold 
                };
            }
        }
    }
    return best ? { eer: best.eer ?? ((best.a.far + best.a.frr) / 2), threshold: best.threshold ?? best.a.threshold } : null;
}

// Compute ROC AUC using trapezoidal rule on (FPR, TPR) points from threshold sweep.
// Returns null if fewer than 2 thresholds have both classes present.
function computeRocAuc(rows) {
    const curve = THRESHOLDS.map(t => metrics(rows, t))
        .filter(m => m.far !== null && m.frr !== null && m.valid_genuine > 0 && m.valid_impostor > 0);
    if (curve.length < 2) return null;
    // Sort by FAR (FPR) ascending for trapezoidal integration
    const sorted = [...curve].sort((a, b) => a.far - b.far);
    let auc = 0;
    for (let i = 1; i < sorted.length; i++) {
        const x1 = sorted[i - 1].far, y1 = sorted[i - 1].tar;
        const x2 = sorted[i].far, y2 = sorted[i].tar;
        auc += (x2 - x1) * (y1 + y2) / 2;
    }
    // Extend to (0,0) and (1,1) if needed
    if (sorted[0].far > 0) auc += sorted[0].far * sorted[0].tar / 2;
    if (sorted[sorted.length - 1].far < 1) auc += (1 - sorted[sorted.length - 1].far) * (1 + sorted[sorted.length - 1].tar) / 2;
    return auc;
}

// Pooled held-out cross-validation metrics.
// Aggregates per-fold test-set confusion matrices (each fold uses its own
// data-selected threshold) into a single cross-validated estimate.
function computePooledMetrics(pooledTP, pooledTN, pooledFP, pooledFN, pooledPairs) {
    const p = pooledTP + pooledFN;
    const n = pooledTN + pooledFP;
    return {
        pooled_pairs: pooledPairs,
        pooled_tp: pooledTP,
        pooled_tn: pooledTN,
        pooled_fp: pooledFP,
        pooled_fn: pooledFN,
        pooled_far: metric(pooledFP, n),
        pooled_frr: metric(pooledFN, p),
        pooled_tar: metric(pooledTP, p),
        pooled_tnr: metric(pooledTN, n),
        pooled_accuracy: metric(pooledTP + pooledTN, p + n),
        pooled_precision: metric(pooledTP, pooledTP + pooledFP),
        pooled_f1: metric(2 * pooledTP, 2 * pooledTP + pooledFP + pooledFN)
    };
}

// Bootstrap confidence intervals for key metrics at a fixed threshold.
// Uses a seeded linear congruential generator for reproducibility.
function bootstrapMetrics(evaluated, threshold, nBootstrap, seed) {
    nBootstrap = nBootstrap || 1000;
    seed = seed || 42;

    let s = seed;
    function rand() {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    }

    const n = evaluated.length;
    const accSamples = [], farSamples = [], frrSamples = [], aucSamples = [];

    for (let b = 0; b < nBootstrap; b++) {
        const sample = new Array(n);
        for (let i = 0; i < n; i++) {
            sample[i] = evaluated[Math.floor(rand() * n)];
        }

        const m = metrics(sample, threshold);
        if (m.far !== null && m.frr !== null && m.accuracy !== null) {
            accSamples.push(m.accuracy);
            farSamples.push(m.far);
            frrSamples.push(m.frr);
        }

        const auc = computeRocAuc(sample);
        if (auc !== null) aucSamples.push(auc);
    }

    function percentile(arr, p) {
        if (arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = (sorted.length - 1) * p;
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return sorted[lo];
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }

    function mean(arr) {
        if (arr.length === 0) return null;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    return {
        n_bootstrap: nBootstrap,
        threshold: threshold,
        accuracy_mean: mean(accSamples),
        accuracy_ci_lo: percentile(accSamples, 0.025),
        accuracy_ci_hi: percentile(accSamples, 0.975),
        far_mean: mean(farSamples),
        far_ci_lo: percentile(farSamples, 0.025),
        far_ci_hi: percentile(farSamples, 0.975),
        frr_mean: mean(frrSamples),
        frr_ci_lo: percentile(frrSamples, 0.025),
        frr_ci_hi: percentile(frrSamples, 0.975),
        auc_mean: aucSamples.length ? mean(aucSamples) : null,
        auc_ci_lo: aucSamples.length ? percentile(aucSamples, 0.025) : null,
        auc_ci_hi: aucSamples.length ? percentile(aucSamples, 0.975) : null
    };
}

// Exclusion bias analysis: quantifies the non-random pattern of image-level
// failures across identities and pair classes.
// `failedImagePaths` is the set of image paths (relative) that actually failed
// face detection, taken from the image_processing_failures.csv data.
function computeExclusionBias(pairRows, failedImagePaths) {
    const fnToIdentity = {};
    const allImages = new Set();
    const genuineImages = new Set();
    const impostorImages = new Set();

    for (const r of pairRows) {
        if (r.image_a_path) {
            const fnA = r.image_a_path.split('/').pop();
            fnToIdentity[fnA] = r.identity_a;
            allImages.add(fnA);
            if (r.ground_truth === 'genuine') genuineImages.add(fnA);
            else impostorImages.add(fnA);
        }
        if (r.image_b_path) {
            const fnB = r.image_b_path.split('/').pop();
            fnToIdentity[fnB] = r.identity_b;
            allImages.add(fnB);
            if (r.ground_truth === 'genuine') genuineImages.add(fnB);
            else impostorImages.add(fnB);
        }
    }

    const failedImages = new Set();
    for (const p of failedImagePaths) {
        failedImages.add(p.split('/').pop());
    }

    const identityFailures = {};
    const identityTotals = {};
    for (const fn of allImages) {
        const id = fnToIdentity[fn];
        if (id) {
            identityTotals[id] = (identityTotals[id] || 0) + 1;
            if (failedImages.has(fn)) {
                identityFailures[id] = (identityFailures[id] || 0) + 1;
            }
        }
    }

    const fullyFailedIds = new Set();
    for (const [id, count] of Object.entries(identityFailures)) {
        if (count === identityTotals[id]) fullyFailedIds.add(id);
    }

    let genuinePairsWithFailed = 0;
    let impostorPairsWithFailed = 0;
    let totalGenuine = 0;
    let totalImpostor = 0;

    for (const r of pairRows) {
        if (r.ground_truth === 'genuine') {
            totalGenuine++;
            if (fullyFailedIds.has(r.identity_a)) genuinePairsWithFailed++;
        } else {
            totalImpostor++;
            if (fullyFailedIds.has(r.identity_a) || fullyFailedIds.has(r.identity_b)) impostorPairsWithFailed++;
        }
    }

    let genuineFailedImages = 0, impostorFailedImages = 0;
    for (const fn of failedImages) {
        if (genuineImages.has(fn)) genuineFailedImages++;
        if (impostorImages.has(fn)) impostorFailedImages++;
    }

    return {
        total_identities: Object.keys(identityTotals).length,
        fully_failed_identities: fullyFailedIds.size,
        total_images: allImages.size,
        failed_images: failedImages.size,
        genuine_images: genuineImages.size,
        impostor_images: impostorImages.size,
        genuine_failed_images: genuineFailedImages,
        impostor_failed_images: impostorFailedImages,
        genuine_image_failure_rate: genuineFailedImages / genuineImages.size,
        impostor_image_failure_rate: impostorFailedImages / impostorImages.size,
        total_genuine_pairs: totalGenuine,
        total_impostor_pairs: totalImpostor,
        genuine_pairs_with_failed_identity: genuinePairsWithFailed,
        impostor_pairs_with_failed_identity: impostorPairsWithFailed,
        genuine_pair_exclusion_rate: genuinePairsWithFailed / totalGenuine,
        impostor_pair_exclusion_rate: impostorPairsWithFailed / totalImpostor
    };
}

// --- MAIN PIPELINE ---
async function main() {
    // Ensure output directories exist
    for (const dir of [CACHE, RESULTS, REPORT]) fs.mkdirSync(dir, { recursive: true });

    // Prevent stale results: delete prior CSVs and any prior run manifest so a
    // failed run can never leave a stale "success" manifest for the plotter to trust.
    if (fs.existsSync(RESULTS)) {
        fs.readdirSync(RESULTS).forEach(f => {
            if (f.endsWith('.csv') || f === 'run_info.json' || f === 'run_info.json.tmp') {
                fs.unlinkSync(path.join(RESULTS, f));
            }
        });
    }

    console.log("[1/4] Validating Dataset and CSV...");
    if (!fs.existsSync(DATASET)) throw new Error(`Dataset directory absent: ${DATASET}`);
    if (!fs.existsSync(PAIRS)) throw new Error(`Missing pairs file: ${PAIRS}`);
    if (!fs.existsSync(MODELS)) throw new Error(`Model directory absent: ${MODELS}`);

    const pairs = parseCsv(fs.readFileSync(PAIRS, 'utf8'));
    const missingColumns = REQUIRED.filter(x => !Object.hasOwn(pairs[0] || {}, x));
    if (missingColumns.length) throw new Error(`Missing required CSV columns: ${missingColumns.join(', ')}`);

    const seen = new Set();
    const failures = [];
    const folds = new Set();
    const labels = { genuine: 0, impostor: 0 };

    const records = pairs.map(r => {
        const rawLabel = String(r.is_same).toLowerCase().trim();
        let same;
        if (rawLabel === '1' || rawLabel === 'true') same = true;
        else if (rawLabel === '0' || rawLabel === 'false') same = false;
        else throw new Error(`Invalid label in pair_id ${r.pair_id}: "${r.is_same}". Must be 1/0 or true/false.`);

        // Reject path traversal on the CSV-stored path before any resolution.
        const raw_a = path.resolve(DATASET, r.image_a_path);
        const raw_b = path.resolve(DATASET, r.image_b_path);
        if (!isInsideDirectory(DATASET, raw_a) || !isInsideDirectory(DATASET, raw_b)) {
            throw new Error(`Path traversal detected in pair ${r.pair_id}`);
        }

        if (seen.has(r.pair_id)) throw new Error(`Duplicate pair_id: ${r.pair_id}`);
        seen.add(r.pair_id);
        folds.add(r.fold_id);

        if (same) labels.genuine++; else labels.impostor++;

        // Resolve to the actual on-disk layout (csv path may be a placeholder;
        // fall back to <DATASET>/<identity>/<filename> derived from the filename).
        const a = resolveImage(r.image_a_path, DATASET);
        const b = resolveImage(r.image_b_path, DATASET);
        const abs_a = a.resolvedPath;
        const abs_b = b.resolvedPath;

        const id_a = identityFromFilename(path.basename(abs_a));
        const id_b = identityFromFilename(path.basename(abs_b));
        if (same && id_a !== id_b) throw new Error(`Genuine pair ${r.pair_id} has different identities: ${id_a} vs ${id_b}`);
        if (!same && id_a === id_b) throw new Error(`Impostor pair ${r.pair_id} has the same identity: ${id_a}`);

        if (!fs.existsSync(abs_a)) failures.push({ image_path: r.image_a_path, pair_id: r.pair_id, failure_reason: 'Missing image A' });
        if (!fs.existsSync(abs_b)) failures.push({ image_path: r.image_b_path, pair_id: r.pair_id, failure_reason: 'Missing image B' });

        return { ...r, is_same: same ? 1 : 0, abs_a, abs_b, path_method: `${a.method}/${b.method}`, status: 'pending' };
    });

    const pairRows = records.map(r => ({
        pair_id: r.pair_id, fold_id: r.fold_id, fold_position: r.fold_position,
        ground_truth: r.is_same ? 'genuine' : 'impostor',
        identity_a: identityFromFilename(r.image_a), identity_b: identityFromFilename(r.image_b),
        image_a_path: r.image_a_path, image_b_path: r.image_b_path,
        resolved_path_a: r.abs_a, resolved_path_b: r.abs_b,
        path_resolution: r.path_method,
        distance: '', prediction_at_0_60: '', evaluation_status: 'not_evaluated',
        failure_reason: (fs.existsSync(r.abs_a) && fs.existsSync(r.abs_b)) ? '' : 'missing image file'
    }));

    const pairRowsById = new Map(pairRows.map(row => [String(row.pair_id), row]));
    const validFiles = records.filter(r => fs.existsSync(r.abs_a) && fs.existsSync(r.abs_b));

    console.log(`[2/4] Initializing Face-API and loading models...`);
    let faceapi;
    try {
        faceapi = require('face-api.js');
        faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS),
            faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS),
            faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS)
        ]);
    } catch (e) {
        throw new Error(`CRITICAL: Failed to load models or initialize environment: ${e.message}`);
    }

    console.log(`[3/4] Extracting descriptors and checking cache (Content SHA-256)...`);
    const configHash = computeModelConfigHash(MODELS);

    const cacheMeta = path.join(CACHE, 'metadata.json');
    let meta = fs.existsSync(cacheMeta) ? JSON.parse(fs.readFileSync(cacheMeta, 'utf8')) : {};
    const descriptors = new Map();
    const needed = new Set(validFiles.flatMap(r => [r.abs_a, r.abs_b]));

    for (const file of needed) {
        const key = path.relative(ROOT, file).replaceAll('\\', '/');
        try {
            const buffer = fs.readFileSync(file);
            const hash = sha256(buffer);
            const cached = meta[key];

            if (cached && cached.sha256 === hash && cached.configHash === configHash) {
                descriptors.set(file, Float32Array.from(cached.descriptor));
                continue;
            }

            const img = new Image();
            img.src = buffer;
            const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
            
            if (!det) throw new Error('no face detected');
            
            const d = Array.from(det.descriptor);
            descriptors.set(file, Float32Array.from(d));
            meta[key] = { sha256: hash, configHash, descriptor: d };
        } catch (e) {
            failures.push({ image_path: key, pair_id: '', failure_reason: `Inference failed: ${e.message}` });
        }
    }
    fs.writeFileSync(cacheMeta, JSON.stringify(meta, null, 2));

    console.log(`[4/4] Computing Pair Distances and Performing Cross-Validation...`);
    for (const r of records) {
        const a = descriptors.get(r.abs_a);
        const b = descriptors.get(r.abs_b);
        const out = pairRowsById.get(String(r.pair_id));

        if (a && b) {
            out.distance = faceapi.euclideanDistance(a, b);
            out.prediction_at_0_60 = out.distance <= BASELINE ? 'match' : 'non-match';
            out.evaluation_status = 'evaluated';
        } else if (out.evaluation_status === 'not_evaluated') {
            out.evaluation_status = 'failed';
            out.failure_reason = 'descriptor unavailable (face extraction failed)';
        }
    }

    const evaluated = pairRows.filter(r => r.evaluation_status === 'evaluated').map(r => ({
        distance: Number(r.distance),
        is_same: r.ground_truth === 'genuine' ? 1 : 0,
        fold_id: r.fold_id,
        identity_a: r.identity_a, identity_b: r.identity_b
    }));

    if (evaluated.length === 0) throw new Error("CRITICAL: 0 pairs were successfully evaluated.");
    const evalGen = evaluated.filter(r => r.is_same === 1).length;
    const evalImp = evaluated.filter(r => r.is_same === 0).length;
    if (evalGen === 0 || evalImp === 0) throw new Error(`CRITICAL: Missing classes in evaluated data. Gen: ${evalGen}, Imp: ${evalImp}.`);

    for (const fold of folds) {
        const foldData = evaluated.filter(r => r.fold_id === fold);
        const genCount = foldData.filter(r => r.is_same === 1).length;
        const impCount = foldData.filter(r => r.is_same === 0).length;
        if (genCount === 0 || impCount === 0) {
            throw new Error(`CRITICAL: Fold ${fold} lacks genuine or impostor pairs. Cross-validation impossible.`);
        }
    }

    writeCsv(path.join(RESULTS, 'biometric_pairs.csv'), Object.keys(pairRows[0]), pairRows);
    const thresholdRows = THRESHOLDS.map(t => metrics(evaluated, t));
    writeCsv(path.join(RESULTS, 'biometric_thresholds.csv'), Object.keys(thresholdRows[0]), thresholdRows);
    writeCsv(path.join(RESULTS, 'image_processing_failures.csv'), ['image_path', 'pair_id', 'failure_reason'], failures);

    // Cross Validation: leave-one-fold-out threshold selection + identity-independence audit.
    const foldRows = [];
    let foldsFailedConstraint = 0;
    let foldsSingleClass = 0;
    let maxIdentityOverlap = 0;

    for (const fold of [...folds].sort((a, b) => Number(a) - Number(b))) {
        const test = evaluated.filter(r => r.fold_id === fold);
        const train = evaluated.filter(r => r.fold_id !== fold);
        const sel = chooseThreshold(train);
        const held = sel.threshold ? metrics(test, sel.threshold) : null;

        if (sel.status === 'frr_constraint_unsatisfiable') foldsFailedConstraint++;
        if (sel.status === 'single_class') foldsSingleClass++;

        // Audit identity independence between this test fold and its training folds.
        const ov = identityOverlap(test, train);
        if (ov.identityOverlapCount > maxIdentityOverlap) maxIdentityOverlap = ov.identityOverlapCount;

        foldRows.push({
            fold_id: fold,
            selection_status: sel.status,
            validation_threshold: sel.threshold ?? '',
            held_out_threshold: sel.threshold ?? '',
            test_pairs: test.length, validation_pairs: train.length,
            train_identity_count: ov.trainIdentityCount,
            test_identity_count: ov.testIdentityCount,
            identity_overlap_count: ov.identityOverlapCount,
            ...Object.fromEntries(['far', 'frr', 'tar', 'tnr', 'accuracy', 'precision', 'f1'].map(k => [`held_out_${k}`, held?.[k] ?? '']))
        });
    }
    writeCsv(path.join(RESULTS, 'fold_results.csv'), Object.keys(foldRows[0] || {}), foldRows);

    // Pooled held-out cross-validation: aggregate per-fold test confusion matrices.
    // Each fold uses its own data-selected threshold, so this pools heterogeneous
    // decisions. Reported as a cross-validated aggregate, not a single-threshold result.
    let pooledTP = 0, pooledTN = 0, pooledFP = 0, pooledFN = 0, pooledPairs = 0;
    for (const row of foldRows) {
        if (row.held_out_far === '' || row.held_out_frr === '') continue;
        const test = evaluated.filter(r => r.fold_id === row.fold_id);
        const tp = row.held_out_tar * (test.filter(r => r.is_same === 1).length);
        const fn = row.held_out_frr * (test.filter(r => r.is_same === 1).length);
        const tn = row.held_out_tnr * (test.filter(r => r.is_same === 0).length);
        const fp = row.held_out_far * (test.filter(r => r.is_same === 0).length);
        pooledTP += Math.round(tp);
        pooledTN += Math.round(tn);
        pooledFP += Math.round(fp);
        pooledFN += Math.round(fn);
        pooledPairs += test.length;
    }
    const pooled = computePooledMetrics(pooledTP, pooledTN, pooledFP, pooledFN, pooledPairs);

    const base = metrics(evaluated, BASELINE);
    const global_desc = chooseThreshold(evaluated); 
    const e = eer(evaluated);
    const rocAuc = computeRocAuc(evaluated);

    // Bootstrap confidence intervals on baseline-threshold metrics (fixed threshold).
    const boot = bootstrapMetrics(evaluated, BASELINE, 1000, 42);

    // Exclusion bias analysis: quantifies non-random image-level failure patterns.
    // Pass the actual image-level failure paths (from the failures array) so that
    // partially-failed pairs are attributed correctly.
    const failedImagePaths = failures.map(f => f.image_path);
    const bias = computeExclusionBias(pairRows, failedImagePaths);

    const summary = [
        ['pair_records', pairs.length],
        ['valid_evaluated_pairs', evaluated.length],
        ['failed_pairs', pairs.length - evaluated.length],
        ['genuine_pairs_evaluated', evalGen],
        ['impostor_pairs_evaluated', evalImp],
        ['identity_overlap_max', maxIdentityOverlap],
        ['baseline_threshold', BASELINE],
        ['baseline_far', base.far ?? ''],
        ['baseline_frr', base.frr ?? ''],
        ['baseline_accuracy', base.accuracy ?? ''],
        ['eer', e?.eer ?? ''],
        ['eer_threshold', e?.threshold ?? ''],
        ['global_descriptive_leaky_threshold', global_desc.threshold ?? ''], 
        ['global_descriptive_leaky_far', global_desc.far ?? ''],
        ['global_descriptive_leaky_frr', global_desc.frr ?? ''],
        ['roc_auc', rocAuc ?? ''],
        ['pooled_cv_pairs', pooled.pooled_pairs],
        ['pooled_cv_far', pooled.pooled_far ?? ''],
        ['pooled_cv_frr', pooled.pooled_frr ?? ''],
        ['pooled_cv_tar', pooled.pooled_tar ?? ''],
        ['pooled_cv_tnr', pooled.pooled_tnr ?? ''],
        ['pooled_cv_accuracy', pooled.pooled_accuracy ?? ''],
        ['pooled_cv_precision', pooled.pooled_precision ?? ''],
        ['pooled_cv_f1', pooled.pooled_f1 ?? ''],
        ['boot_n', boot.n_bootstrap],
        ['boot_threshold', boot.threshold],
        ['boot_accuracy_lo', boot.accuracy_ci_lo ?? ''],
        ['boot_accuracy_hi', boot.accuracy_ci_hi ?? ''],
        ['boot_far_lo', boot.far_ci_lo ?? ''],
        ['boot_far_hi', boot.far_ci_hi ?? ''],
        ['boot_frr_lo', boot.frr_ci_lo ?? ''],
        ['boot_frr_hi', boot.frr_ci_hi ?? ''],
        ['boot_auc_lo', boot.auc_ci_lo ?? ''],
        ['boot_auc_hi', boot.auc_ci_hi ?? ''],
        ['excl_total_identities', bias.total_identities],
        ['excl_fully_failed_identities', bias.fully_failed_identities],
        ['excl_total_images', bias.total_images],
        ['excl_failed_images', bias.failed_images],
        ['excl_genuine_image_failure_rate', bias.genuine_image_failure_rate ?? ''],
        ['excl_impostor_image_failure_rate', bias.impostor_image_failure_rate ?? ''],
        ['excl_genuine_pair_exclusion_rate', bias.genuine_pair_exclusion_rate ?? ''],
        ['excl_impostor_pair_exclusion_rate', bias.impostor_pair_exclusion_rate ?? '']
    ];
    writeCsv(path.join(RESULTS, 'biometric_summary.csv'), ['metric', 'value'], summary.map(([metric, value]) => ({ metric, value })));

    const report = `# LFW facial-verification evaluation
Generated: ${new Date().toISOString()}

## Methodology & Fold Independence
Pairs and fold assignments were parsed directly from pairs.csv. Person identity was derived from each image filename (LFW convention <identity>_<NNNN>.jpg), not from the images/NNN split segment in the CSV.

Cross-validation follows a leave-one-fold-out protocol using fold_id. For each fold the set of person identities in the held-out test split was compared against the union of person identities in the other ${folds.size} training folds. Maximum identity overlap observed across folds: **${maxIdentityOverlap}**. A non-zero value means the held-out fold shares identities with its training folds, which would violate the identity-independence assumption required for honest cross-validation.

Note: the images/000..images/013 segment in image_a_path/image_b_path is a 14-value split index and does not align 1:1 with the 10 fold_id values. fold_id is treated as the cross-validation protocol field; this file is not asserted to be an official LFW pairs.txt fold assignment.

## Execution status
Evaluated pairs: **${evaluated.length}**. Failures: **${pairs.length - evaluated.length}** (recorded in results/image_processing_failures.csv).

## Pooled Cross-Validation
Each fold uses its own data-selected threshold. Pooling per-fold test-set confusion matrices yields a cross-validated aggregate estimate (n=${pooled.pooled_pairs} held-out pairs): accuracy **${(pooled.pooled_accuracy * 100).toFixed(3)}%**, FAR **${(pooled.pooled_far * 100).toFixed(3)}%**, FRR **${(pooled.pooled_frr * 100).toFixed(3)}%**. This pools heterogeneous thresholds and is a looser estimate than the fixed-baseline single-threshold result.

## Bootstrap Confidence Intervals
1,000 bootstrap resamples at the fixed baseline threshold (θ=0.60). 95% percentile intervals: accuracy **${(boot.accuracy_ci_lo * 100).toFixed(3)}%–${(boot.accuracy_ci_hi * 100).toFixed(3)}%**, FAR **${(boot.far_ci_lo * 100).toFixed(3)}%–${(boot.far_ci_hi * 100).toFixed(3)}%**, FRR **${(boot.frr_ci_lo * 100).toFixed(3)}%–${(boot.frr_ci_hi * 100).toFixed(3)}%**, AUC **${boot.auc_ci_lo?.toFixed(4) ?? 'n/a'}–${boot.auc_ci_hi?.toFixed(4) ?? 'n/a'}**.

## Exclusion Bias
Image-level failures are not uniformly distributed. **${bias.fully_failed_identities}** of ${bias.total_identities} identities had **all** their images fail face detection (${bias.total_images} images total, ${bias.failed_images} failed). These identities contribute ${(bias.genuine_pair_exclusion_rate * 100).toFixed(1)}% of genuine pairs and ${(bias.impostor_pair_exclusion_rate * 100).toFixed(1)}% of impostor pairs to the excluded set. Image-level failure rates are ${(bias.genuine_image_failure_rate * 100).toFixed(1)}% (genuine) vs ${(bias.impostor_image_failure_rate * 100).toFixed(1)}% (impostor), but the concentration of fully-failed identities creates an asymmetric exclusion that should be considered when interpreting the evaluated-pair metrics.

## Validation
Leave-one-fold-out threshold selection requires FRR <= 0.10, applied to the 9 training folds of each split. **This FRR <= 0.10 rule is an operational heuristic for this experiment, not a clinical, regulatory, or security requirement.** Folds failing this constraint: **${foldsFailedConstraint} out of ${folds.size}**. Folds with single-class training data: **${foldsSingleClass} out of ${folds.size}**.

The production threshold (data-independent baseline) is ${BASELINE}. Data-selected thresholds are distinguished clearly: "global_descriptive_leaky_*" metrics are descriptive only (selected on the full evaluated set, not independently validated; they leak test data and must not be used for deployment), while the per-fold "held_out" metrics are estimated on each fold's held-out test set with the threshold chosen from the other folds.

## Limitations
LFW is an unconstrained face-verification benchmark, not a clinical access-control evaluation. It does not evaluate presentation-attack resistance (liveness), demographic equity, or healthcare security.
`;
    fs.writeFileSync(path.join(REPORT, 'evaluation_report.md'), report);

    // Write a success manifest LAST. A failed run throws before this point and
    // leaves no manifest, so the plotter cannot mistake a stale/partial run for success.
    const runInfo = {
        exit_status: 'success',
        generated_at: new Date().toISOString(),
        pipeline_version: PIPELINE_VERSION,
        model_config_hash: configHash,
        baseline_threshold: BASELINE,
        evaluated_pairs: evaluated.length,
        failed_pairs: pairs.length - evaluated.length,
        pair_records: pairs.length,
        folds: [...folds].sort((a, b) => Number(a) - Number(b)),
        identity_overlap_max: maxIdentityOverlap
    };
    const tmpInfo = path.join(RESULTS, 'run_info.json.tmp');
    fs.writeFileSync(tmpInfo, JSON.stringify(runInfo, null, 2));
    fs.renameSync(tmpInfo, path.join(RESULTS, 'run_info.json'));

    console.log(`\n[SUCCESS] Evaluation complete. Evaluated ${evaluated.length}/${pairs.length} pairs. Folds failed FRR constraint: ${foldsFailedConstraint}. Folds single-class: ${foldsSingleClass}. Run Python plotter.`);
}

if (require.main === module) {
    main().catch(e => {
        console.error(`\n[FATAL ERROR] ${e.stack || e.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    sha256, isInsideDirectory, csvLine, writeCsv, parseCsv, metric, metrics,
    chooseThreshold, eer, identityFromFilename, resolveImage, computeModelConfigHash,
    identityOverlap, computeRocAuc, computePooledMetrics, bootstrapMetrics,
    computeExclusionBias, BASELINE, THRESHOLDS, PIPELINE_VERSION
};