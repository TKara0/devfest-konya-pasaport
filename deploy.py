#!/usr/bin/env python3
"""Google Cloud / Firebase kurulum ve yayın işleri.

  python deploy.py kurulum  --proje <proje-id>   # bir kez: API'ler, sır, izinler, Firestore kuralları
  python deploy.py seed                           # görevler, oturumlar, kodlar, roller → Firestore
  python deploy.py yayinla                        # API → Cloud Run, ön yüz → Firebase Hosting
  python deploy.py yayinla --sadece api|web
  python deploy.py etkinlik-gunu                  # Cloud Run'ı sıcak tut (min 1 kopya)
  python deploy.py etkinlik-gunu --kapat          # etkinlikten sonra min 0

Her komutta --dene ile hiçbir şey çalıştırmadan yapılacakları yazdırır.
Proje kimliği bir kez --proje ile verilince .firebaserc'ye yazılır, sonra tekrar gerekmez.
Gerekenler: gcloud CLI (giriş yapılmış), Node.js 22+. Firebase CLI npx ile otomatik kullanılır.
"""
import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
API = os.path.join(ROOT, "api")
WEB = os.path.join(ROOT, "web")
WIN = os.name == "nt"

REGION = "europe-west1"
SERVICE = "pasaport-api"
SECRET = "pasaport-code-secret"
APIS = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
]

DRY = False


def log(msg):
    print(f"[deploy] {msg}", flush=True)


def fail(msg):
    print(f"[deploy] HATA: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def run(cmd, cwd=ROOT, env=None, check=True, capture=False, stdin=None):
    shown = " ".join(cmd)
    if DRY:
        print(f"  $ {shown}" + (f"   (klasör: {os.path.relpath(cwd, ROOT)})" if cwd != ROOT else ""))
        return ""
    log(shown)
    r = subprocess.run(
        cmd if not WIN else shown,
        cwd=cwd,
        env=env,
        shell=WIN,
        text=True,
        input=stdin,
        capture_output=capture,
    )
    if check and r.returncode != 0:
        fail(f"komut başarısız oldu: {shown}" + (f"\n{r.stderr}" if capture and r.stderr else ""))
    return (r.stdout or "").strip() if capture else ""


def need(tool, hint):
    if DRY:
        return
    if not shutil.which(tool):
        fail(f"'{tool}' bulunamadı. {hint}")


FIREBASE = ["npx", "--yes", "firebase-tools"]


def read_project(args):
    rc = os.path.join(ROOT, ".firebaserc")
    if args.proje:
        if not DRY:
            with open(rc, "w", encoding="utf-8") as f:
                json.dump({"projects": {"default": args.proje}}, f, indent=2)
                f.write("\n")
        return args.proje
    if os.path.exists(rc):
        with open(rc, encoding="utf-8") as f:
            pid = json.load(f).get("projects", {}).get("default")
        if pid:
            return pid
    fail("Proje kimliği yok. İlk seferde --proje <proje-id> ver (Firebase konsolu → Proje ayarları → Proje kimliği).")


def check_web_env():
    path = os.path.join(WEB, ".env")
    keys = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    keys[k] = v
    missing = [k for k in ("VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID") if not keys.get(k)]
    if missing and not DRY:
        fail(
            "web/.env eksik: " + ", ".join(missing) + ".\n"
            "  Firebase konsolu → Proje ayarları → Uygulamalarınız → Web uygulaması → SDK yapılandırması.\n"
            "  web/.env.example dosyasını web/.env olarak kopyalayıp doldur."
        )


# ---------------------------------------------------------------- komutlar


def kurulum(args):
    need("gcloud", "https://cloud.google.com/sdk/docs/install adresinden kur, sonra `gcloud auth login`.")
    need("npx", "Node.js 22+ kur.")
    pid = read_project(args)
    log(f"Proje: {pid}")

    run(["gcloud", "config", "set", "project", pid])
    log("Gerekli Google Cloud API'leri açılıyor (birkaç dakika sürebilir)")
    run(["gcloud", "services", "enable", *APIS])

    # Saatlik kodları üreten sır: zaten varsa dokunma (değişirse o saatin kodları geçersiz olur)
    exists = DRY or subprocess.run(
        ["gcloud", "secrets", "describe", SECRET] if not WIN else f"gcloud secrets describe {SECRET}",
        shell=WIN, capture_output=True,
    ).returncode == 0
    if DRY or not exists:
        log(f"'{SECRET}' sırrı oluşturuluyor")
        run(["gcloud", "secrets", "create", SECRET, "--replication-policy=automatic", "--data-file=-"], stdin=secrets.token_hex(32))
    else:
        log(f"'{SECRET}' sırrı zaten var, korunuyor")

    number = run(["gcloud", "projects", "describe", pid, "--format=value(projectNumber)"], capture=True) or "<PROJE_NUMARASI>"
    sa = f"{number}-compute@developer.gserviceaccount.com"
    log("Cloud Run servis hesabına sır okuma ve Firestore izni veriliyor")
    run(["gcloud", "secrets", "add-iam-policy-binding", SECRET, f"--member=serviceAccount:{sa}", "--role=roles/secretmanager.secretAccessor", "--quiet"])
    run(["gcloud", "projects", "add-iam-policy-binding", pid, f"--member=serviceAccount:{sa}", "--role=roles/datastore.user", "--condition=None", "--quiet"])

    log(f"Firestore veritabanı ({REGION}) oluşturuluyor (varsa atlanır)")
    out = run(["gcloud", "firestore", "databases", "create", f"--location={REGION}", "--quiet"], check=False, capture=True)
    if out and not DRY:
        log("Firestore hazır")

    log("Firestore kuralları ve sıralama indeksi yükleniyor")
    run([*FIREBASE, "deploy", "--only", "firestore", "--project", pid, "--non-interactive"])

    print(
        f"""
[deploy] Otomatik kısım bitti. Firebase konsolunda ({pid}) elle yapılacaklar:

  1. Authentication → Sign-in method → Email/Password'ü aç ve
     "Email link (passwordless sign-in)" seçeneğini işaretle. Google sağlayıcısı GEREKMEZ.
  2. Authentication → Settings → Authorized domains: sitenin adresi listede olmalı
     ({pid}.web.app varsayılan olarak var; özel alan adı kullanacaksan ekle).
  3. Authentication → Templates → Email address sign-in: şablon dilini Türkçe yap.
  4. Authentication → Settings içindeki kayıt kotası (sign-up quota) ayarından etkinlik günü için
     geçici artış planla. Varsayılan sınır IP başına saatte 100 yeni hesap; salondaki herkes
     aynı Wi-Fi'dan kayıt olursa bu sınıra takılır.
  5. Proje ayarları → Web uygulaması ekle → yapılandırmayı web/.env dosyasına yaz.
  6. api/seed/event.json'u gerçek görev/oturum/rollerle doldur, sonra:
       gcloud auth application-default login
       python deploy.py seed
       python deploy.py yayinla
"""
    )


def seed(args):
    pid = read_project(args)
    path = os.path.join(API, "seed", "event.json")
    if not os.path.exists(path) and not DRY:
        fail("api/seed/event.json yok. api/seed/event.example.json'u kopyalayıp gerçek verilerle doldur.")
    if not os.path.isdir(os.path.join(API, "node_modules")):
        run(["npm", "ci"], cwd=API)
    env = {**os.environ, "GCLOUD_PROJECT": pid, "GOOGLE_CLOUD_PROJECT": pid}
    env.pop("FIRESTORE_EMULATOR_HOST", None)
    log("Seed çalışıyor (kimlik: gcloud auth application-default login)")
    run(["npm", "run", "seed"], cwd=API, env=env)
    log("Baskı listesi: api/seed/codes-print.csv")


def yayinla(args):
    need("gcloud", "Google Cloud CLI kur ve `gcloud auth login` yap.")
    pid = read_project(args)

    if args.sadece in (None, "api"):
        log("API → Cloud Run (kaynak koddan derlenir, ilk seferde 3-5 dk)")
        run([
            "gcloud", "run", "deploy", SERVICE,
            "--source", "api",
            "--region", REGION,
            "--project", pid,
            "--allow-unauthenticated",
            f"--set-secrets=CODE_SECRET={SECRET}:latest",
            "--max-instances=10",
            "--concurrency=80",
            "--memory=512Mi",
            "--quiet",
        ])

    if args.sadece in (None, "web"):
        check_web_env()
        log("Ön yüz derleniyor")
        run(["npm", "ci"], cwd=WEB)
        run(["npm", "run", "build"], cwd=WEB)
        log("Ön yüz → Firebase Hosting")
        run([*FIREBASE, "deploy", "--only", "hosting", "--project", pid, "--non-interactive"])

    if not DRY:
        log(f"Bitti: https://{pid}.web.app")


def etkinlik_gunu(args):
    need("gcloud", "Google Cloud CLI kur.")
    pid = read_project(args)
    n = "0" if args.kapat else "1"
    log(f"Cloud Run en az {n} kopya" + (" (etkinlik bitti)" if args.kapat else " (ilk istek beklemesin)"))
    run(["gcloud", "run", "services", "update", SERVICE, "--region", REGION, "--project", pid, f"--min-instances={n}", "--quiet"])


def main():
    global DRY
    p = argparse.ArgumentParser(description="DevFest Konya Pasaport — Google Cloud kurulum ve yayın")
    p.add_argument("--dene", action="store_true", help="hiçbir şey çalıştırmadan komutları yazdır")
    sub = p.add_subparsers(dest="komut", required=True)

    k = sub.add_parser("kurulum", help="bir kez: API'ler, sır, izinler, Firestore kuralları")
    k.add_argument("--proje")
    s = sub.add_parser("seed", help="etkinlik verisini Firestore'a yaz")
    s.add_argument("--proje")
    y = sub.add_parser("yayinla", help="API ve ön yüzü yayınla")
    y.add_argument("--proje")
    y.add_argument("--sadece", choices=["api", "web"])
    e = sub.add_parser("etkinlik-gunu", help="Cloud Run'ı sıcak tut / kapat")
    e.add_argument("--proje")
    e.add_argument("--kapat", action="store_true")

    args = p.parse_args()
    DRY = args.dene
    if DRY:
        print("[deploy] DENEME: komutlar çalıştırılmayacak, sadece yazdırılıyor.\n")
    {"kurulum": kurulum, "seed": seed, "yayinla": yayinla, "etkinlik-gunu": etkinlik_gunu}[args.komut](args)


if __name__ == "__main__":
    main()
