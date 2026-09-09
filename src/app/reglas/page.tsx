import Link from "next/link";

export default function ReglasPage() {
  return (
    <div className="space-y-5 pb-8">
      <div className="sticky top-0 z-10 -mx-4 border-b border-line/70 bg-ink/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Reglas de la liga</h1>
          <Link
            href="/"
            className="rounded-lg bg-grass px-3 py-1.5 text-sm font-semibold text-ink"
          >
            Cerrar
          </Link>
        </div>
        <p className="mt-1 text-xs text-white/45">Fantasy Bros · LaLiga 2026/27</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">1. Idea del juego</h2>
        <p className="text-sm text-white/75">
          Eres el manager de un equipo fantasy: fichas, alineas un once, sumas puntos. Los puntos
          suben tu clasificación y te dan dinero para seguir fichando. Gana quien más puntos acumule.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
          2. Presupuesto y plantilla
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">
          <li>Dinero inicial: <strong className="text-white">40.000.000 €</strong></li>
          <li>Máximo de jugadores: <strong className="text-white">22</strong></li>
        </ul>
        <p className="rounded-lg bg-panel px-3 py-2 text-sm text-white/65">
          <span className="text-white/45">Ejemplo · </span>
          Empiezas con 40M € y 0 jugadores. Fichas 15 y te quedan 8M € de saldo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
          3. Mercado: comprar libres
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">
          <li>Todos los sin dueño van al mercado a su Valor de Mercado (VM).</li>
          <li>Pujas <strong className="text-white">ciegas</strong> hasta el cierre (~07:00 Madrid).</li>
          <li>Gana la puja más alta válida.</li>
        </ul>
        <p className="text-sm text-white/75">Para un jugador de VM 10M €:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">
          <li>Mínimo: 75% del VM → 7,5M €</li>
          <li>Máximo por VM: 150% → 15M €</li>
          <li>Tope cartera: saldo + 25% del valor de tu plantilla</li>
        </ul>
        <p className="rounded-lg bg-panel px-3 py-2 text-sm text-white/65">
          <span className="text-white/45">Ejemplo · </span>
          VM 8M €, saldo 4M € → no puedes pujar el mínimo (6M). Necesitas más saldo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">4. Vender</h2>
        <p className="text-sm text-white/75">
          Puedes vender en cualquier estado. Máximo <strong className="text-white">3 ventas/día</strong>{" "}
          (Madrid). En Equipo ves VM y último fichaje.
        </p>
        <div className="space-y-3 text-sm text-white/75">
          <div>
            <p className="font-medium text-white">A) Oferta Mercado</p>
            <p>
              Nadie puede pujar. Al cierre la máquina paga entre el 75% y el 100% del último fichaje.
              Luego queda libre a VM.
            </p>
            <p className="mt-1 text-white/55">
              Ejemplo: fichado por 10M → cobras entre 7,5M y 10M.
            </p>
          </div>
          <div>
            <p className="font-medium text-white">B) Oferta a rival</p>
            <p>Caduca en 7 días. Sin contraofertas. Si acepta, ese precio es el nuevo último fichaje.</p>
          </div>
          <div>
            <p className="font-medium text-white">C) Venta inmediata</p>
            <p>60% del último fichaje al momento. Ejemplo: 10M → cobras 6M.</p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">5. Alineación</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">
          <li>Solo puntúa el once titular.</li>
          <li>Hueco vacío = 0 puntos.</li>
          <li>Lesionados y sancionados no alineables.</li>
        </ul>
        <p className="rounded-lg bg-panel px-3 py-2 text-sm text-white/65">
          <span className="text-white/45">Ejemplo · </span>
          Once con 48 pts totales entre titulares → tu jornada son 48.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">6. Puntos</h2>
        <p className="text-sm text-white/75">
          Fuente: Jornada Perfecta (media AS / SofaScore). Solo cuentan si están en tu once.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">7. Clasificación</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">
          <li>Empieza en la <strong className="text-white">jornada 5</strong>.</li>
          <li>J1–J4: puntos de jugadores en catálogo, no suman a managers.</li>
        </ul>
        <p className="rounded-lg bg-panel px-3 py-2 text-sm text-white/65">
          <span className="text-white/45">Ejemplo · </span>
          J5: 52 pts + J6: 41 pts → clasificación 93.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">8. Primas de dinero</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">
          <li>
            <strong className="text-white">20.000 €</strong> por cada punto de tu once
          </li>
          <li>
            <strong className="text-white">+60.000 €</strong> si eres el mejor de la jornada (MVP)
          </li>
        </ul>
        <p className="rounded-lg bg-panel px-3 py-2 text-sm text-white/65">
          <span className="text-white/45">Ejemplo · </span>
          45 pts y eres MVP → +900.000 € + 60.000 € = <strong className="text-white">960.000 €</strong>{" "}
          al saldo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">9. Resumen</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-white/75">
          <li>40M € iniciales, máx. 22 jugadores.</li>
          <li>Pujas ciegas 75–150% del VM, cierre ~07:00.</li>
          <li>3 formas de venta; máx. 3 ventas/día.</li>
          <li>Solo puntúa el once; clasificación y primas desde J5.</li>
        </ol>
      </section>

      <div className="pt-2">
        <Link
          href="/"
          className="block w-full rounded-xl bg-grass py-3 text-center text-sm font-semibold text-ink"
        >
          Volver al juego
        </Link>
      </div>
    </div>
  );
}
