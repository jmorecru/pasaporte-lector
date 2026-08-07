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
    agudo.connect(suave).connect(vol).connect(this.master);
    this.fuente(blanco, agudo);

    // Un fondo grave da sensación de lluvia cercana, no de spray.
    const grave = this.filtro('lowpass', 350);
    const volGrave = this.ganancia(0.3);
    grave.connect(volGrave).connect(this.master);
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
    src.connect(banda).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 0.09);
  }

  mar() {
    const marron = bufferRuidoMarron(this.ctx);

    // La ola: ruido grave cuyo volumen sube y baja despacio. Esa respiración
    // lenta es lo que el oído reconoce como mar y no como ruido de fondo.
    const cuerpo = this.filtro('lowpass', 700);
    const volOla = this.ganancia(0.25);
    cuerpo.connect(volOla).connect(this.master);
    this.fuente(marron, cuerpo);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;              // una ola cada 11 segundos
    const profundidad = this.ganancia(0.35);
    lfo.connect(profundidad).connect(volOla.gain);
    lfo.start();
    this.nodos.push(lfo);

    // La espuma: agudos que asoman solo en la cresta de cada ola.
    const espuma = this.filtro('highpass', 1800);
    const volEspuma = this.ganancia(0.02);
    espuma.connect(volEspuma).connect(this.master);
    this.fuente(bufferRuidoBlanco(this.ctx), espuma);

    const lfoEspuma = this.ctx.createOscillator();
    lfoEspuma.frequency.value = 0.09;
    const profEspuma = this.ganancia(0.05);
    lfoEspuma.connect(profEspuma).connect(volEspuma.gain);
    lfoEspuma.start();
    this.nodos.push(lfoEspuma);
  }

  bosque() {
    // Viento entre las ramas: grave y con el filtro moviéndose despacio, para
    // que parezca que la brisa va y viene.
    const viento = this.filtro('lowpass', 450);
    const volViento = this.ganancia(0.3);
    viento.connect(volViento).connect(this.master);
    this.fuente(bufferRuidoMarron(this.ctx), viento);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const barrido = this.ganancia(220);
    lfo.connect(barrido).connect(viento.frequency);
    lfo.start();
    this.nodos.push(lfo);

    // Hojas: siseo agudo muy flojo, el detalle que separa un bosque de una cueva.
    const hojas = this.filtro('bandpass', 3200, 0.8);
    const volHojas = this.ganancia(0.05);
    hojas.connect(volHojas).connect(this.master);
    this.fuente(bufferRuidoBlanco(this.ctx), hojas);

    // Pájaros de vez en cuando. Es la parte más difícil de fingir: son silbidos
    // sintetizados, agradables, pero no engañan a nadie que escuche con atención.
    this.cadaTanto(4, 14, () => this.pajaro());
  }

  pajaro() {
    const t = this.ctx.currentTime;
    const silabas = 1 + Math.floor(Math.random() * 3);
    const base = 1900 + Math.random() * 1300;
    for (let i = 0; i < silabas; i++) {
      const inicio = t + i * 0.13;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const f = base * (0.94 + Math.random() * 0.12);
      osc.frequency.setValueAtTime(f, inicio);
      osc.frequency.exponentialRampToValueAtTime(f * 1.5, inicio + 0.05);
      osc.frequency.exponentialRampToValueAtTime(f * 0.95, inicio + 0.1);
      const env = this.ganancia(0);
      env.gain.setValueAtTime(0, inicio);
      env.gain.linearRampToValueAtTime(0.06, inicio + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0005, inicio + 0.11);
      osc.connect(env).connect(this.master);
      osc.start(inicio);
      osc.stop(inicio + 0.14);
    }
  }
}

// Una sola instancia para toda la app: la pantalla se repinta a menudo y el
// sonido no debe cortarse por eso.
export const ambiente = new Ambiente();
