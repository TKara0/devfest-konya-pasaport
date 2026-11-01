#!/usr/bin/env python3
"""Yerel geliştirme ortamını tek komutla başlatır: python start.py

Sırayla: bağımlılıklar -> Firebase emülatörleri (auth + firestore) -> seed -> API -> ön yüz.
Ctrl+C ile hepsi kapanır.
"""
import os
import re
import shutil
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
API = os.path.join(ROOT, "api")
WEB = os.path.join(ROOT, "web")
WIN = os.name == "nt"

PROJECT = "demo-pasaport"
FIRESTORE_PORT = 8081
AUTH_PORT = 9099
API_PORT = 8080
WEB_PORT = 5173

procs = []


def log(msg):
    print(f"[start] {msg}", flush=True)


def run(cmd, cwd=ROOT, env=None):
    """Bitmesini bekleyerek çalıştırır; hata olursa durur."""
    subprocess.run(cmd, cwd=cwd, env=env, shell=WIN, check=True)


def spawn(cmd, cwd=ROOT, env=None):
    p = subprocess.Popen(cmd, cwd=cwd, env=env, shell=WIN)
    procs.append(p)
    return p


def wait_port(port, name, timeout=180):
    end = time.time() + timeout
    while time.time() < end:
        for host in ("127.0.0.1", "::1"):
            try:
                with socket.create_connection((host, port), timeout=1):
                    return
            except OSError:
                pass
        time.sleep(1)
    raise RuntimeError(f"{name} {timeout} sn içinde hazır olmadı (port {port})")


def java_major():
    java = shutil.which("java")
    if not java:
        return None
    out = subprocess.run([java, "-version"], capture_output=True, text=True).stderr
    m = re.search(r'version "(\d+)(?:\.(\d+))?', out)
    if not m:
        return None
    major = int(m.group(1))
    return int(m.group(2) or 0) if major == 1 else major


def kill_all():
    for p in reversed(procs):
        if p.poll() is not None:
            continue
        if WIN:
            subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True)
        else:
            p.terminate()
    for p in procs:
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            p.kill()


def main():
    for tool in ("node", "npm", "npx"):
        if not shutil.which(tool):
            sys.exit(f"{tool} bulunamadı. Node.js 22+ kurun.")

    java = java_major()
    if java is None:
        sys.exit("Java bulunamadı. Firebase emülatörleri için JDK 17+ kurun.")
    # firebase-tools'un son sürümü Java 21 ister; daha eskisinde 13.x kullanılır.
    fb = "firebase-tools" if java >= 21 else "firebase-tools@13.35.1"
    log(f"Java {java} -> {fb}")

    for d in (API, WEB):
        if not os.path.isdir(os.path.join(d, "node_modules")):
            log(f"npm ci ({os.path.basename(d)})")
            run("npm ci", cwd=d)

    event = os.path.join(API, "seed", "event.json")
    if not os.path.exists(event):
        log("api/seed/event.json yok, event.example.json kopyalanıyor")
        shutil.copy(os.path.join(API, "seed", "event.example.json"), event)

    api_env = {
        **os.environ,
        "FIRESTORE_EMULATOR_HOST": f"127.0.0.1:{FIRESTORE_PORT}",
        "FIREBASE_AUTH_EMULATOR_HOST": f"127.0.0.1:{AUTH_PORT}",
        "GCLOUD_PROJECT": PROJECT,
        "CODE_SECRET": "yerel-gelistirme-sirri-123",
    }
    web_env = {
        **os.environ,
        "VITE_USE_EMULATOR": "true",
        "VITE_FIREBASE_PROJECT_ID": PROJECT,
    }

    try:
        log("Firebase emülatörleri başlatılıyor...")
        spawn(f"npx --yes {fb} emulators:start --only auth,firestore --project {PROJECT}")
        wait_port(FIRESTORE_PORT, "Firestore emülatörü")
        wait_port(AUTH_PORT, "Auth emülatörü")

        log("Seed çalışıyor...")
        run("npm run seed", cwd=API, env=api_env)

        log("API başlatılıyor...")
        spawn("npm run dev", cwd=API, env=api_env)
        wait_port(API_PORT, "API")

        log("Ön yüz başlatılıyor...")
        spawn("npm run dev", cwd=WEB, env=web_env)
        wait_port(WEB_PORT, "Ön yüz")

        print(
            "\n"
            f"  Ön yüz:        http://localhost:{WEB_PORT}\n"
            f"  API:           http://localhost:{API_PORT}\n"
            "  Emülatör arayüzü: http://localhost:4000\n"
            "\n  Durdurmak için Ctrl+C\n",
            flush=True,
        )

        while True:
            for p in procs:
                if p.poll() is not None:
                    raise RuntimeError(f"Bir süreç beklenmedik şekilde kapandı (çıkış kodu {p.returncode})")
            time.sleep(1)
    except KeyboardInterrupt:
        log("Kapatılıyor...")
    except (RuntimeError, subprocess.CalledProcessError) as e:
        log(f"Hata: {e}")
        kill_all()
        sys.exit(1)
    kill_all()


if __name__ == "__main__":
    main()
