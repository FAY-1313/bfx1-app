# Inspect + int8-quantize the 4 Spleeter fp16 ONNX mask models.
# Usage: python scripts/spleeter_quant.py  (from repo root)
# Outputs int8 models to public/assets/models/.

import os

import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

# Windows: bash 的 /tmp 对应系统临时目录
SRC = os.environ.get("SPLEETER_SRC", r"C:\Users\FAY\AppData\Local\Temp\spleeter_onnx")
DST = os.path.join("public", "assets", "models")
STEMS = ["vocals", "drums", "bass", "other"]

os.makedirs(DST, exist_ok=True)


def inspect(path):
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    info = []
    for inp in sess.get_inputs():
        info.append(f"  input:  name={inp.name} shape={inp.shape} type={inp.type}")
    for out in sess.get_outputs():
        info.append(f"  output: name={out.name} shape={out.shape} type={out.type}")
    return "\n".join(info)


for stem in STEMS:
    src = os.path.join(SRC, f"spleeter-5stem-{stem}-logits-fp16.onnx")
    print(f"=== {stem} ===")
    try:
        print(inspect(src))
    except Exception as e:
        print(f"  INSPECT FAILED: {e}")
    dst = os.path.join(DST, f"spleeter-5stem-{stem}-mask.onnx")
    print(f"  quantizing -> {dst}")
    try:
        quantize_dynamic(
            src,
            dst,
            weight_type=QuantType.QInt8,
            op_types_to_quantize=["Conv", "MatMul", "Gemm"],
        )
        print(f"  done: {os.path.getsize(dst)} bytes")
    except Exception as e:
        print(f"  QUANT FAILED: {e}")
