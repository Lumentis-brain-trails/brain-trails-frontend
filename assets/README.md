# assets/

Materiale di design pronto all'uso, indipendente dal framework. Niente build, niente
dipendenze: ogni file HTML si apre con doppio click.

| Percorso | Cos'è |
|---|---|
| `motion/motion.css` | **Sorgente di verità** dei token di movimento: durate, easing, spostamenti, politica `prefers-reduced-motion`. Da importare una volta in `globals.css`. |
| `motion/motion.ts` | Gli stessi valori per JS/Motion (ex framer-motion): spring, variants riusabili (`fadeUp`, `listStagger`, `step`). |
| `motion-kit/index.html` | La **motion kit page**: tutti i pattern di animazione in funzione, con i controlli per provarli. Riferimento visivo prima ancora che esista il frontend. |
| `loader/brain-loader.html` | Il loader a pagina intera: la mascotte che scende dalla montagna. |

## Come si usa

Importa i token una volta sola, poi usali ovunque:

```css
/* src/app/globals.css */
@import "../../assets/motion/motion.css";

.card { transition: transform var(--m-base) var(--m-out); }
```

Le tre regole che tengono insieme il sistema:

1. **Solo `transform` e `opacity`.** Mai `height`, `width`, `top`. Con un grafico
   Plotly aperto la differenza si vede a occhio nudo.
2. **Ogni durata viene da un token.** Se serve un valore nuovo si aggiunge a
   `motion.css`, non nel componente.
3. **`prefers-reduced-motion` è centralizzato.** Marca le animazioni decorative con
   `data-motion="decor"` e quelle di stato con `data-motion="status"`: la politica in
   fondo a `motion.css` fa il resto.

## Nota sui colori

La palette usata qui (bianco + viola) è quella del loader ed è una **proposta**: il
piano colori definitivo del sito è un lavoro a parte. I token di movimento non cambiano
al cambiare dei colori.
