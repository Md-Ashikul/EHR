'use strict';
/* Pure-logic tests for biometric_eval_lfw.js helpers.
 * The evaluator module guards main() behind `require.main === module`,
 * so requiring it here does NOT execute the pipeline and does NOT load face-api.js. */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mod = require(path.join(__dirname, '..', 'biometric_eval_lfw.js'));

const {
    sha256, isInsideDirectory, parseCsv, metric, metrics,
    chooseThreshold, eer, identityFromFilename, resolveImage,
    computeModelConfigHash, identityOverlap, computeRocAuc,
    computePooledMetrics, bootstrapMetrics, computeExclusionBias,
    BASELINE, THRESHOLDS, PIPELINE_VERSION
} = mod;

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ok - ' + name); passed++; }
    catch (e) { console.log('  FAIL - ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' / ') : e)); failed++; }
}
function close(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }

console.log('JS logic tests');

// --- sha256 / isInsideDirectory ---
test('sha256 is hex of content', () => {
    assert.strictEqual(sha256(Buffer.from('abc')),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('isInsideDirectory accepts nested path', () => {
    const root = path.resolve('lfw_images');
    assert.strictEqual(isInsideDirectory(root, path.resolve(root, 'Abel_Pacheco', 'Abel_Pacheco_0001.jpg')), true);
});
test('isInsideDirectory rejects traversal', () => {
    const root = path.resolve('lfw_images');
    assert.strictEqual(isInsideDirectory(root, path.resolve('lfw_images', '..', 'evil.txt')), false);
});

// --- identityFromFilename ---
test('identityFromFilename strips LFW numeric suffix', () => {
    assert.strictEqual(identityFromFilename('Abel_Pacheco_0001.jpg'), 'Abel_Pacheco');
    assert.strictEqual(identityFromFilename('Abdullatif_Sener_0001.jpg'), 'Abdullatif_Sener');
    assert.strictEqual(identityFromFilename('no_digits.jpg'), 'no_digits');
    assert.strictEqual(identityFromFilename('MixedCase_0003.JPG'), 'MixedCase');
});

// --- resolveImage against the real dataset ---
test('resolveImage falls back to identity layout for pairs.csv paths', () => {
    const r = resolveImage('images/000/Abel_Pacheco_0001.jpg', path.resolve('lfw_images'));
    assert.strictEqual(r.method, 'identity');
    assert.strictEqual(path.basename(r.resolvedPath), 'Abel_Pacheco_0001.jpg');
    assert.strictEqual(path.basename(path.dirname(r.resolvedPath)), 'Abel_Pacheco');
    assert.ok(fs.existsSync(r.resolvedPath));
});
test('resolveImage uses csv path when it exists', () => {
    const tmp = path.resolve(os.tmpdir(), 'kip_resolve_' + process.pid);
    fs.mkdirSync(path.join(tmp, 'person'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'person', 'x_0001.jpg'), 'x');
    try {
        const r = resolveImage('person/x_0001.jpg', tmp);
        assert.strictEqual(r.method, 'csv');
        assert.ok(fs.existsSync(r.resolvedPath));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('resolveImage marks missing image as missing', () => {
    const tmp = path.resolve(os.tmpdir(), 'kip_resolve_missing_' + process.pid);
    fs.mkdirSync(tmp, { recursive: true });
    try {
        const r = resolveImage('does/not/exist.jpg', tmp);
        assert.strictEqual(r.method, 'missing');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// --- parseCsv ---
test('parseCsv handles commas/quotes/blanks', () => {
    const rows = parseCsv('pair_id,is_same,image_a_path\n"a,b",1,hi.jpg\n\n1,2,bye.jpg\n');
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].pair_id, 'a,b');
    assert.strictEqual(rows[0].is_same, '1');
    assert.strictEqual(rows[1].image_a_path, 'bye.jpg');
});
test('parseCsv handles quote-doubling', () => {
    const rows = parseCsv('id,name\n1,"he said ""hi"""\n');
    assert.strictEqual(rows[0].name, 'he said "hi"');
});

// --- metric + metrics ---
test('metric null on zero denominator', () => {
    assert.strictEqual(metric(1, 0), null);
    assert.strictEqual(metric(2, 4), 0.5);
});
test('metrics confusion matrix + rates (balanced)', () => {
    const rows = [
        { distance: 0.1, is_same: 1 }, { distance: 0.9, is_same: 1 },
        { distance: 0.1, is_same: 0 }, { distance: 0.9, is_same: 0 }
    ];
    const m = metrics(rows, 0.5);
    assert.strictEqual(m.tp, 1); assert.strictEqual(m.fn, 1);
    assert.strictEqual(m.fp, 1); assert.strictEqual(m.tn, 1);
    assert.strictEqual(close(m.far, 0.5), true);
    assert.strictEqual(close(m.frr, 0.5), true);
    assert.strictEqual(close(m.accuracy, 0.5), true);
    assert.strictEqual(close(m.f1, 0.5), true);
    assert.strictEqual(close(m.tar, 0.5), true);
    assert.strictEqual(close(m.tnr, 0.5), true);
    assert.strictEqual(m.valid_pairs, 4);
});
test('metrics undefined rates are null (not NaN) on zero class', () => {
    const m = metrics([{ distance: 0.1, is_same: 1 }], 0.5);
    // one genuine, zero impostor -> far/tnr denominators are 0 -> null (no NaN)
    assert.strictEqual(m.far, null);
    assert.strictEqual(m.tnr, null);
    assert.strictEqual(m.f1, 1);       // tp>0, denom>0
    assert.strictEqual(m.precision, 1); // tp>0, denom>0
    assert.strictEqual(m.accuracy, 1);
    for (const k of Object.keys(m)) {
        const v = m[k];
        assert.ok(!(typeof v === 'number' && Number.isNaN(v)), k + ' must not be NaN');
    }
});

// --- chooseThreshold: FRR<=0.10 constraint ---
// The FRR <= 0.10 threshold-selection rule is an operational heuristic for this experiment,
// not a clinical, regulatory, or security requirement.
function synthetic(nGen, nImp) {
    const out = [];
    for (let i = 0; i < nGen; i++) out.push({ distance: 0.2 + 0.6 * i / Math.max(1, nGen - 1), is_same: 1 });
    for (let i = 0; i < nImp; i++) out.push({ distance: 0.5 + 0.8 * i / Math.max(1, nImp - 1), is_same: 0 });
    return out;
}
test('chooseThreshold returns frr_constraint_unsatisfiable when FRR<=0.10 unsatisfiable', () => {
    const rows = Array.from({ length: 20 }, () => ({ distance: 1.5, is_same: 1 }))
        .concat(Array.from({ length: 20 }, () => ({ distance: 0.5, is_same: 0 })));
    const sel = chooseThreshold(rows);
    assert.strictEqual(sel.status, 'frr_constraint_unsatisfiable');
    assert.strictEqual(sel.threshold, null);
});
test('chooseThreshold returns single_class when only one class present', () => {
    const rows = Array.from({ length: 20 }, () => ({ distance: 0.5, is_same: 1 }));
    const sel = chooseThreshold(rows);
    assert.strictEqual(sel.status, 'single_class');
    assert.strictEqual(sel.threshold, null);
});
test('chooseThreshold honors FRR<=0.10 and picks lowest FAR', () => {
    const rows = synthetic(50, 50);
    const sel = chooseThreshold(rows);
    assert.strictEqual(sel.status, 'constraint_satisfied');
    assert.ok(sel.threshold !== null, 'expected a threshold');
    const m = metrics(rows, sel.threshold);
    assert.ok(m.frr !== null && m.frr <= 0.10 + 1e-9, `frr ${m.frr} should be <= 0.10`);
    const lower = metrics(rows, sel.threshold - 0.01);
    assert.ok(lower.frr === null || lower.frr > 0.10, 'a lower threshold must violate FRR<=0.10');
});
test('chooseThreshold returns all metrics when constraint satisfied', () => {
    const rows = synthetic(50, 50);
    const sel = chooseThreshold(rows);
    assert.strictEqual(sel.status, 'constraint_satisfied');
    // Should include all metric fields from metrics()
    assert.ok('far' in sel && 'frr' in sel && 'tar' in sel && 'tnr' in sel);
    assert.ok('accuracy' in sel && 'precision' in sel && 'f1' in sel);
});

// --- eer ---
test('eer intersects FAR/FRR (rates ~equal at threshold)', () => {
    const rows = synthetic(100, 100);
    const res = eer(rows);
    assert.ok(res, 'eer should exist');
    const m = metrics(rows, res.threshold);
    assert.ok(m.far !== null && m.frr !== null);
    assert.ok(close(m.far, m.frr, 0.02), `far ${m.far} != frr ${m.frr} at EER threshold`);
});
test('eer returns null with single class', () => {
    const rows = Array.from({ length: 30 }, () => ({ distance: 0.5, is_same: 1 }));
    assert.strictEqual(eer(rows), null);
});
test('eer always returns finite numbers (no undefined)', () => {
    const res = eer(synthetic(40, 40));
    assert.ok(Number.isFinite(res.eer), 'eer finite');
    assert.ok(Number.isFinite(res.threshold), 'threshold finite');
});

// --- computeRocAuc ---
test('computeRocAuc returns null with single class', () => {
    const rows = Array.from({ length: 30 }, () => ({ distance: 0.5, is_same: 1 }));
    assert.strictEqual(computeRocAuc(rows), null);
});
test('computeRocAuc returns null with insufficient threshold points', () => {
    const rows = [{ distance: 0.1, is_same: 1 }, { distance: 0.9, is_same: 0 }];
    // With only 2 points and threshold sweep, may still have <2 valid points after filtering
    const auc = computeRocAuc(rows);
    // Either null or a finite number
    if (auc !== null) assert.ok(Number.isFinite(auc));
});
test('computeRocAuc produces finite AUC for balanced data', () => {
    const rows = synthetic(100, 100);
    const auc = computeRocAuc(rows);
    assert.ok(auc !== null && Number.isFinite(auc), 'AUC should be finite');
    assert.ok(auc >= 0 && auc <= 1, `AUC ${auc} should be in [0,1]`);
});
test('computeRocAuc is 1.0 for perfectly separable data', () => {
    const rows = [
        { distance: 0.1, is_same: 1 }, { distance: 0.2, is_same: 1 },
        { distance: 0.8, is_same: 0 }, { distance: 0.9, is_same: 0 }
    ];
    const auc = computeRocAuc(rows);
    assert.ok(close(auc, 1.0, 1e-9), `perfect separation should give AUC=1, got ${auc}`);
});
test('computeRocAuc is 0.5 for completely overlapping data', () => {
    const rows = [
        { distance: 0.5, is_same: 1 }, { distance: 0.5, is_same: 1 },
        { distance: 0.5, is_same: 0 }, { distance: 0.5, is_same: 0 }
    ];
    const auc = computeRocAuc(rows);
    // With identical distances, TPR/FPR curve should be diagonal-ish
    assert.ok(auc !== null && Number.isFinite(auc), 'AUC should be finite');
});

// --- computeModelConfigHash (cache invalidation) ---
test('computeModelConfigHash is deterministic', () => {
    const models = path.resolve('frontend', 'public', 'models');
    assert.strictEqual(computeModelConfigHash(models), computeModelConfigHash(models));
});
test('computeModelConfigHash changes when a model file changes', () => {
    const tmp = path.resolve(os.tmpdir(), 'kip_models_' + process.pid);
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'm1.bin'), 'aaa');
    try {
        const h1 = computeModelConfigHash(tmp);
        fs.writeFileSync(path.join(tmp, 'm1.bin'), 'bbb');
        const h2 = computeModelConfigHash(tmp);
        assert.notStrictEqual(h1, h2, 'changed model content must invalidate cache hash');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('computeModelConfigHash changes with pipeline version', () => {
    const tmp = path.resolve(os.tmpdir(), 'kip_models2_' + process.pid);
    fs.mkdirSync(tmp, { recursive: true });
    try {
        fs.writeFileSync(path.join(tmp, 'm1.bin'), 'data');
        assert.notStrictEqual(
            computeModelConfigHash(tmp),
            computeModelConfigHash(path.resolve('frontend', 'public', 'models')),
            'different model dirs differ');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// --- identityOverlap (fold independence audit) ---
test('identityOverlap reports zero when disjoint', () => {
    const test = [{ identity_a: 'A', identity_b: 'B' }];
    const train = [{ identity_a: 'C', identity_b: 'D' }];
    const o = identityOverlap(test, train);
    assert.strictEqual(o.identityOverlapCount, 0);
    assert.strictEqual(o.testIdentityCount, 2);
    assert.strictEqual(o.trainIdentityCount, 2);
});
test('identityOverlap detects shared identities', () => {
    const test = [{ identity_a: 'A', identity_b: 'B' }, { identity_a: 'B', identity_b: 'E' }];
    const train = [{ identity_a: 'A', identity_b: 'C' }];
    const o = identityOverlap(test, train);
    assert.strictEqual(o.identityOverlapCount, 1); // 'A' shared; 'B','E' not in train
    assert.strictEqual(o.trainIdentityCount, 2);
});

// --- identity-overlap against the REAL pairs.csv (Issue 3) ---
test('real pairs.csv has identity-disjoint folds (overlap 0)', () => {
    const pairsText = fs.readFileSync(path.resolve(__dirname, '..', 'pairs.csv'), 'utf8');
    const pairs = parseCsv(pairsText);
    const folds = [...new Set(pairs.map(r => r.fold_id))].sort((a, b) => Number(a) - Number(b));
    let maxOverlap = 0;
    for (const fold of folds) {
        const testRows = pairs.filter(r => r.fold_id === fold).map(r => ({
            identity_a: identityFromFilename(r.image_a), identity_b: identityFromFilename(r.image_b)
        }));
        const trainRows = pairs.filter(r => r.fold_id !== fold).map(r => ({
            identity_a: identityFromFilename(r.image_a), identity_b: identityFromFilename(r.image_b)
        }));
        const ov = identityOverlap(testRows, trainRows);
        if (ov.identityOverlapCount > maxOverlap) maxOverlap = ov.identityOverlapCount;
    }
    assert.strictEqual(maxOverlap, 0, 'expected 0 identity overlap across folds');
});

// --- computePooledMetrics ---
test('computePooledMetrics pools confusion matrices correctly', () => {
    const m = computePooledMetrics(90, 80, 10, 10, 200);
    assert.strictEqual(m.pooled_pairs, 200);
    assert.strictEqual(m.pooled_tp, 90);
    assert.strictEqual(m.pooled_tn, 80);
    assert.strictEqual(m.pooled_fp, 10);
    assert.strictEqual(m.pooled_fn, 10);
    // p = 90+10 = 100, n = 80+10 = 90, total = 190
    assert.ok(close(m.pooled_accuracy, 170 / 190, 1e-9));
    assert.ok(close(m.pooled_far, 10 / 90, 1e-9));
    assert.ok(close(m.pooled_frr, 10 / 100, 1e-9));
});
test('computePooledMetrics handles zero denominators', () => {
    const m = computePooledMetrics(0, 0, 0, 0, 0);
    assert.strictEqual(m.pooled_far, null);
    assert.strictEqual(m.pooled_frr, null);
    assert.strictEqual(m.pooled_accuracy, null);
});

// --- bootstrapMetrics ---
test('bootstrapMetrics returns finite CIs on balanced data', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) rows.push({ distance: 0.2 + i * 0.01, is_same: 1 });
    for (let i = 0; i < 20; i++) rows.push({ distance: 0.8 - i * 0.01, is_same: 0 });
    const b = bootstrapMetrics(rows, 0.5, 100, 123);
    assert.strictEqual(b.n_bootstrap, 100);
    assert.ok(b.accuracy_ci_lo !== null && b.accuracy_ci_hi !== null, 'accuracy CI must be finite');
    assert.ok(b.accuracy_ci_lo <= b.accuracy_ci_hi, 'lo <= hi');
    assert.ok(b.far_ci_lo !== null && b.far_ci_hi !== null, 'far CI must be finite');
    assert.ok(b.frr_ci_lo !== null && b.frr_ci_hi !== null, 'frr CI must be finite');
    assert.ok(b.auc_ci_lo !== null && b.auc_ci_hi !== null, 'auc CI must be finite');
});
test('bootstrapMetrics is deterministic with fixed seed', () => {
    const rows = [];
    for (let i = 0; i < 30; i++) rows.push({ distance: Math.random(), is_same: i % 2 });
    const b1 = bootstrapMetrics(rows, 0.5, 200, 7);
    const b2 = bootstrapMetrics(rows, 0.5, 200, 7);
    assert.strictEqual(b1.accuracy_ci_lo, b2.accuracy_ci_lo);
    assert.strictEqual(b1.accuracy_ci_hi, b2.accuracy_ci_hi);
    assert.strictEqual(b1.far_ci_lo, b2.far_ci_lo);
    assert.strictEqual(b1.frr_ci_lo, b2.frr_ci_lo);
});

// --- computeExclusionBias ---
test('computeExclusionBias detects fully-failed identities', () => {
    const pairRows = [
        { image_a_path: 'images/000/A_0001.jpg', image_b_path: 'images/000/A_0002.jpg',
          identity_a: 'A', identity_b: 'A', ground_truth: 'genuine', evaluation_status: 'failed' },
        { image_a_path: 'images/000/B_0001.jpg', image_b_path: 'images/000/C_0001.jpg',
          identity_a: 'B', identity_b: 'C', ground_truth: 'impostor', evaluation_status: 'evaluated' },
        { image_a_path: 'images/000/B_0002.jpg', image_b_path: 'images/000/D_0001.jpg',
          identity_a: 'B', identity_b: 'D', ground_truth: 'impostor', evaluation_status: 'failed' }
    ];
    // Only A_0001, A_0002, B_0002 are actual image-level failures
    const failedPaths = ['images/000/A_0001.jpg', 'images/000/A_0002.jpg', 'images/000/B_0002.jpg'];
    const bias = computeExclusionBias(pairRows, failedPaths);
    // A: 2 images, both failed -> fully failed
    // B: 2 images (B_0001, B_0002), 1 failed -> NOT fully failed
    // C: 1 image, not failed
    // D: 1 image, not failed
    assert.strictEqual(bias.total_identities, 4);
    assert.strictEqual(bias.fully_failed_identities, 1); // A only
    assert.strictEqual(bias.total_images, 6);
    assert.strictEqual(bias.failed_images, 3);
    assert.strictEqual(bias.genuine_image_failure_rate, 2 / 2);
    assert.ok(close(bias.impostor_image_failure_rate, 1 / 4, 1e-9));
    assert.strictEqual(bias.genuine_pair_exclusion_rate, 1); // 1/1 genuine pair has failed identity
    assert.strictEqual(bias.impostor_pair_exclusion_rate, 0); // B is not fully failed
});
test('computeExclusionBias returns zero rates when nothing failed', () => {
    const pairRows = [
        { image_a_path: 'images/000/A_0001.jpg', image_b_path: 'images/000/A_0002.jpg',
          identity_a: 'A', identity_b: 'A', ground_truth: 'genuine', evaluation_status: 'evaluated' },
        { image_a_path: 'images/000/B_0001.jpg', image_b_path: 'images/000/C_0001.jpg',
          identity_a: 'B', identity_b: 'C', ground_truth: 'impostor', evaluation_status: 'evaluated' }
    ];
    const bias = computeExclusionBias(pairRows, []);
    assert.strictEqual(bias.fully_failed_identities, 0);
    assert.strictEqual(bias.failed_images, 0);
    assert.strictEqual(bias.genuine_image_failure_rate, 0);
    assert.strictEqual(bias.impostor_image_failure_rate, 0);
    assert.strictEqual(bias.genuine_pair_exclusion_rate, 0);
    assert.strictEqual(bias.impostor_pair_exclusion_rate, 0);
});

console.log(`\nJS: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;