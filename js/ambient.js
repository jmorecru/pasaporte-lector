// Sonido ambiente para leer, generado en el navegador con Web Audio.
//
// No se descarga ningún fichero: el sonido se fabrica sobre la marcha a partir
// de ruido filtrado. Eso resuelve tres cosas de golpe — no añade peso a la web,
// no hay licencias de audio que revisar, y el bucle no tiene costura porque no
// hay bucle: se está generando continuamente.
//
// La lluvia y el mar salen convincentes por lo que son: agua es esencialmente
// ruido con un filtrado concreto. El bosque es más difícil, porque los pájaros
// no son ruido; se sintetizan como silbidos cortos y se oyen de vez en cuando.
//
// Limitación conocida: el navegador suspende el audio cuando la página deja de
// verse, así que es previsible que se pare al bloquear la pantalla. Si molesta,
// el paso siguiente es generar el sonido una vez y reproducirlo con un <audio>
// normal, que sí sigue con la pantalla apagada.

export const SONIDOS = [
  { id: 'lluvia', etiqueta: 'Lluvia', emoji: '🌧️' },
  { id: 'mar', etiqueta: 'Mar', emoji: '🌊' },
  { id: 'bosque', etiqueta: 'Bosque', emoji: '🌲' }
];

const CLAVE_VOLUMEN = 'pasaporte-volumen';

// Nivel de mezcla de cada sonido. Existe porque el oído no juzga el volumen por
// la energía de la señal: la lluvia concentra la suya en agudos, donde oímos
// mejor, mientras que el mar y el viento viven en graves y se perciben mucho más
// flojos con la misma amplitud. Estos números igualan lo que se oye, no lo que
// mide el aparato, y son el sitio donde tocar si un sonido queda descompensado.
const NIVEL = {
  lluvia: 0.85,
  mar: 2.2,
  bosque: 1.9
};

/** Ruido blanco: base de la lluvia y de las hojas. */
function bufferRuidoBlanco(ctx, segundos = 4) {
  const largo = Math.floor(ctx.sampleRate * segundos);
  const buffer = ctx.createBuffer(1, largo, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Ruido marrón: más grave y envolvente, sirve para el mar y el viento. */
function bufferRuidoMarron(ctx, segundos = 4) {
  const largo = Math.floor(ctx.sampleRate * segundos);
  const buffer = ctx.createBuffer(1, largo, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  let anterior = 0;
  for (let i = 0; i < largo; i++) {
    const blanco = Math.random() * 2 - 1;
    anterior = (anterior + 0.02 * blanco) / 1.02;
    datos[i] = anterior * 3.5;
  }
  return buffer;
}

export class Ambiente {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bus = null;        // nivel de mezcla del sonido activo
    this.nodos = [];        // todo lo que hay que parar al cambiar de sonido
    this.temporizadores = [];
    this.actual = null;
    const guardado = parseFloat(localStorage.getItem(CLAVE_VOLUMEN));
    this.volumen = Number.isFinite(guardado) ? guardado : 0.5;
  }

  get sonando() { return this.actual; }

  /**
   * Arranca un sonido. Debe llamarse desde un gesto del usuario: los
   * navegadores móviles no dejan sonar nada sin una pulsación de por medio.
   */
  async reproducir(id) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volumen;
      this.master.connect(this.ctx.destination);
    }
    // En iOS el contexto nace suspendido hasta que lo despierta un gesto.
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (e) { /* sin audio */ } }

    this.parar();
    this.actual = id;
    // Cada sonido cuelga de su propio nivel de mezcla, y este del volumen general.
    this.bus = this.ganancia(NIVEL[id] || 1);
    this.bus.connect(this.master);
    if (id === 'lluvia') this.lluvia();
    else if (id === 'mar') this.mar();
    else if (id === 'bosque') this.bosque();
    return true;
  }

  parar() {
    this.temporizadores.forEach(t => clearTimeout(t));
    this.temporizadores = [];
    this.nodos.forEach(n => { try { n.stop(); } catch (e) { /* ya parado */ } });
    this.nodos = [];
    if (this.bus) { try { this.bus.disconnect(); } catch (e) { /* ya suelto */ } this.bus = null; }
    this.actual = null;
  }

  setVolumen(v) {
    this.volumen = Math.min(1, Math.max(0, v));
    localStorage.setItem(CLAVE_VOLUMEN, String(this.volumen));
    if (this.master) {
      // Rampa corta: saltar el volumen de golpe produce un chasquido.
      this.master.gain.setTargetAtTime(this.volumen, this.ctx.currentTime, 0.05);
    }
  }

  // ---- Piezas ----

  /** Fuente de ruido en bucle, ya conectada a la cadena que se le pase. */
  fuente(buffer, destino) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(destino);
    src.start();
    this.nodos.push(src);
    return src;
  }

  filtro(tipo, frecuencia, q) {
    const f = this.ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = frecuencia;
    if (q != null) f.Q.value = q;
    return f;
  }

  ganancia(valor) {
    const g = this.ctx.createGain();
    g.gain.value = valor;
    return g;
  }

  /** Programa algo que se repite a intervalos irregulares (gotas, pájaros). */
  cadaTanto(minSeg, maxSeg, accion) {
    const siguiente = () => {
      const espera = (minSeg + Math.random() * (maxSeg - minSeg)) * 1000;
      const t = setTimeout(() => {
        if (!this.actual) return;
        accion();
        siguiente();
      }, espera);
      this.temporizadores.push(t);
    };
    siguiente();
  }

  // ---- Sonidos ----

  lluvia() {
    const blanco = bufferRuidoBlanco(this.ctx);

    // El siseo: ruido recortado por arriba y por abajo. Sin el paso alto suena
    // a viento; sin el paso bajo, a estática de radio.
    const agudo = this.filtro('highpass', 700);
    const suave = this.filtro('lowpass', 6500);
    const vol = this.ganancia(0.55);
    agudo.connect(suave).connect(vol).connect(this.bus);
    this.fuente(blanco, agudo);

    // Un fondo grave da sensación de lluvia cercana, no de spray.
    const grave = this.filtro('lowpass', 350);
    const volGrave = this.ganancia(0.3);
    grave.connect(volGrave).connect(this.bus);
    this.fuente(bufferRuidoMarron(this.ctx), grave);

    // Gotas sueltas: sin ellas la lluvia es plana y se nota artificial.
    this.cadaTanto(0.12, 0.7, () => this.gota());
  }

  gota() {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = bufferRuidoBlanco(this.ctx, 0.06);
    const banda = this.filtro('bandpass', 1200 + Math.random() * 2500, 8);
    const env = this.ganancia(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.18 + Math.random() * 0.15, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    src.connect(banda).connect(env).connect(this.bus);
    src.start(t);
    src.stop(t + 0.09);
  }

  mar() {
    const marron = bufferRuidoMarron(this.ctx);

    // La ola: ruido grave cuyo volumen sube y baja despacio. Esa respiración
    // lenta es lo que el oído reconoce como mar y no como ruido de fondo.
    // El corte va más arriba que un mar "de fondo" a propósito: dejarlo en
    // graves puros lo hacía casi inaudible frente a la lluvia.
    const cuerpo = this.filtro('lowpass', 1100);
    const volOla = this.ganancia(0.4);
    cuerpo.connect(volOla).connect(this.bus);
    this.fuente(marron, cuerpo);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;              // una ola cada 11 segundos
    const profundidad = this.ganancia(0.3);
    lfo.connect(profundidad).connect(volOla.gain);
    lfo.start();
    this.nodos.push(lfo);

    // La espuma: agudos que asoman en la cresta de cada ola. Es lo que da la
    // pista de que hay agua rompiendo y no solo un rumor grave.
    const espuma = this.filtro('highpass', 1400);
    const volEspuma = this.ganancia(0.09);
    espuma.connect(volEspuma).connect(this.bus);
    this.fuente(bufferRuidoBlanco(this.ctx), espuma);

    const lfoEspuma = this.ctx.createOscillator();
    lfoEspuma.frequency.value = 0.09;
    const profEspuma = this.ganancia(0.08);
    lfoEspuma.connect(profEspuma).connect(volEspuma.gain);
    lfoEspuma.start();
    this.nodos.push(lfoEspuma);
  }

  bosque() {
    // El viento es el decorado, no el protagonista: se queda bajo y sin llegar
    // a medios, para que no tape los pájaros ni suene a ventisca.
    const viento = this.filtro('lowpass', 320);
    const volViento = this.ganancia(0.12);
    viento.connect(volViento).connect(this.bus);
    this.fuente(bufferRuidoMarron(this.ctx), viento);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const barrido = this.ganancia(140);
    lfo.connect(barrido).connect(viento.frequency);
    lfo.start();
    this.nodos.push(lfo);

    // Hojas: siseo agudo suave, el detalle que separa un bosque de una cueva.
    const hojas = this.filtro('bandpass', 3400, 0.7);
    const volHojas = this.ganancia(0.06);
    hojas.connect(volHojas).connect(this.bus);
    this.fuente(bufferRuidoBlanco(this.ctx), hojas);

    // Los pájaros son el bosque. Antes se oían cada 4-14 segundos y muy flojos,
    // así que lo único constante era el viento y parecía una tormenta lejana.
    this.cadaTanto(1.4, 5, () => this.pajaro());
  }

  /**
   * Un canto de varias sílabas. La variedad importa más que el realismo de cada
   * silbido: un pájaro que repite siempre lo mismo se delata como máquina, y al
   * alternar cantos cercanos y lejanos parece que hay varios en el bosque.
   */
  pajaro() {
    const t = this.ctx.currentTime;
    const silabas = 1 + Math.floor(Math.random() * 4);
    const base = 1700 + Math.random() * 1800;
    const lejano = Math.random() < 0.4;              // unos suenan más al fondo
    const cuerpo = lejano ? 0.09 : 0.22;
    const separacion = 0.09 + Math.random() * 0.08;

    for (let i = 0; i < silabas; i++) {
      const inicio = t + i * separacion;
      const osc = this.ctx.createOscillator();
      osc.type = Math.random() < 0.3 ? 'triangle' : 'sine';
      const f = base * (0.9 + Math.random() * 0.2);
      // El barrido de frecuencia es lo que convierte un pitido en un trino.
      osc.frequency.setValueAtTime(f, inicio);
      osc.frequency.exponentialRampToValueAtTime(f * (1.3 + Math.random() * 0.5), inicio + 0.045);
      osc.frequency.exponentialRampToValueAtTime(f * 0.92, inicio + 0.095);

      const env = this.ganancia(0);
      env.gain.setValueAtTime(0, inicio);
      env.gain.linearRampToValueAtTime(cuerpo, inicio + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0005, inicio + 0.1);

      // Los lejanos pierden agudos, como pasa con la distancia de verdad.
      const aire = this.filtro('lowpass', lejano ? 2600 : 9000);
      osc.connect(env).connect(aire).connect(this.bus);
      osc.start(inicio);
      osc.stop(inicio + 0.13);
    }
  }
}

// Una sola instancia para toda la app: la pantalla se repinta a menudo y el
// sonido no debe cortarse por eso.
export const ambiente = new Ambiente();
