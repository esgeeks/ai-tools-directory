#!/usr/bin/env python3
"""
Traductor por lotes con Argos Translate (código abierto, local, sin servicios de pago).

Entrada (stdin, JSON):  {"items": [{"id": "...", "text": "...", "source": "en", "target": "es"}]}
Salida  (stdout, JSON): {"available": true, "results": [{"id": "...", "text": "..."}], "error": null}

Si Argos no está instalado o falta el paquete de idioma, devuelve available=false y el pipeline
usa el texto original (mecanismo de respaldo). Nunca ejecuta contenido de las fuentes.
"""
import contextlib
import json
import sys


def ensure_package(source: str, target: str) -> bool:
    import argostranslate.package
    import argostranslate.translate

    installed = argostranslate.translate.get_installed_languages()
    codes = {lang.code: lang for lang in installed}
    if source in codes and target in codes and codes[source].get_translation(codes[target]):
        return True
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    pkg = next((p for p in available if p.from_code == source and p.to_code == target), None)
    if pkg is None:
        return False
    argostranslate.package.install_from_path(pkg.download())
    return True


def main() -> None:
    payload = json.load(sys.stdin)
    real_stdout = sys.stdout
    # Cualquier mensaje de las bibliotecas va a stderr: stdout queda reservado para el JSON final.
    with contextlib.redirect_stdout(sys.stderr):
        result = run(payload)
    json.dump(result, real_stdout, ensure_ascii=False)


def run(payload: dict) -> dict:
    items = payload.get("items", [])
    try:
        import argostranslate.translate
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "results": [], "error": f"argostranslate no disponible: {exc}"}

    results = []
    ready = {}
    errors = []
    for item in items:
        pair = (item["source"], item["target"])
        if pair not in ready:
            try:
                ready[pair] = ensure_package(*pair)
            except Exception as exc:  # noqa: BLE001
                ready[pair] = False
                errors.append(f"{pair}: {exc}")
        if not ready[pair]:
            continue
        try:
            out = argostranslate.translate.translate(item["text"], item["source"], item["target"])
            results.append({"id": item["id"], "text": out})
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{item['id']}: {exc}")
    return {"available": any(ready.values()), "results": results, "error": "; ".join(errors) or None}


if __name__ == "__main__":
    main()
