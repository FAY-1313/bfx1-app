# -*- coding: utf-8 -*-
"""End-to-end smoke test for the Demucs stem-split server (urllib, no 3rd-party deps)."""
import json
import mimetypes
import os
import sys
import time
import urllib.request

BASE = "http://192.168.1.213:8000"
AUDIO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_stem_input.wav")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stems_result.zip")


def multipart_post(url, filepath, timeout=1800):
    boundary = "----wb-stemtest-" + str(int(time.time() * 1000))
    fname = os.path.basename(filepath)
    ctype = mimetypes.guess_type(filepath)[0] or "application/octet-stream"
    with open(filepath, "rb") as f:
        filedata = f.read()
    body = b""
    body += ("--%s\r\n" % boundary).encode()
    body += ('Content-Disposition: form-data; name="file"; filename="%s"\r\n' % fname).encode()
    body += ("Content-Type: %s\r\n\r\n" % ctype).encode()
    body += filedata
    body += ("\r\n--%s--\r\n" % boundary).encode()

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "multipart/form-data; boundary=%s" % boundary},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        info = dict(resp.headers.items())
    return raw, info, time.time() - t0


def main():
    # 1. health
    with urllib.request.urlopen(BASE + "/health", timeout=15) as r:
        print("[health]", r.status, r.read().decode())

    # 2. split
    print("[split] POST", AUDIO, "(%d bytes)" % os.path.getsize(AUDIO))
    raw, info, dt = multipart_post(BASE + "/split", AUDIO)
    print("[split] took %.1fs, status=%s, content-type=%s" % (dt, info.get("Content-Type"), info.get("Content-Length")))
    if not raw:
        print("[split] EMPTY RESPONSE - FAIL")
        sys.exit(1)
    # Server returns either JSON error or zip binary
    if raw[:1] == b"{":
        print("[split] SERVER ERROR:", raw.decode()[:500])
        sys.exit(1)
    with open(OUT, "wb") as f:
        f.write(raw)
    print("[split] saved ->", OUT, len(raw), "bytes")


if __name__ == "__main__":
    main()
