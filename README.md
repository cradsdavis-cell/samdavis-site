# samdavis-site

The public site for Sam Davis — AI coach & systems builder.

## Structure

- `/` — landing page (index.html)
- `/overview/` — product demo deck (what the EA is)
- `/offer/` — offer deck (how we work together)

## Hosting

Deployed via GitHub Pages. Once Pages is enabled in repo settings (Source: Deploy from branch, main / root), the site is live at:

- `https://cradsdavis-cell.github.io/samdavis-site/`
- Or the custom domain set in `CNAME`.

## Custom domain (when registered)

1. Register domain (e.g. samdavis.ai).
2. Edit `CNAME` in this repo to contain the domain.
3. At the registrar, add DNS records:
   - Apex (`samdavis.ai`): four A records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - www CNAME: `cradsdavis-cell.github.io.`
4. In repo Settings → Pages, set custom domain + enable HTTPS (wait ~15 min for cert).
