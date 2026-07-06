.PHONY: dev static pages forge cf test sync-forge

dev:
	./start.sh

static:
	chmod +x deploy/build-static.sh
	VARIANT=pages ./deploy/build-static.sh qbpm _site
	python3 -m http.server 8080 -d _site

pages:
	VARIANT=pages ./deploy/build-static.sh qbpm _site

forge:
	VARIANT=forge ./deploy/build-static.sh Qbpm _site

cf:
	VARIANT=cloudflare ./deploy/build-static.sh

test:
	uv run pytest -q

sync-forge:
	chmod +x scripts/publish-fornevercollective.sh
	./scripts/publish-fornevercollective.sh