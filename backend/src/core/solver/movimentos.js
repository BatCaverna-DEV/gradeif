// F2-13 — Movimentos de vizinhança. Cada função sorteia um movimento e devolve
// { tipo, blocos, destinos } ou null quando não há movimento possível.
// Aulas fixadas não pertencem a nenhum bloco, então nenhum movimento as alcança.

import { SEM_SALA_LIVRE } from './estado.js'

// Sala para o bloco nos novos tempos: a atual, se servir; senão uma compatível
// livre; senão uma compatível qualquer (o avaliador cobra o choque).
function salaPara(estado, b, hs, rnd) {
  const { inst } = estado
  if (inst.S === 0) return -1
  const candidatas = inst.atrSalas[b.a]
  if (b.s >= 0 && candidatas.includes(b.s) && estado.salaServe(b.s, hs)) return b.s
  const livre = estado.escolherSala(b, hs)
  return livre === SEM_SALA_LIVRE ? rnd.escolher(candidatas) : livre
}

// Mover um bloco para outro início (também serve para alocar bloco que ficou de fora).
export function moverBloco(estado, rnd) {
  const b = rnd.escolher(estado.ativos)
  const dominio = estado.dominio(b.a, b.tam)
  if (!dominio.length) return null
  const h0 = rnd.escolher(dominio)
  if (h0 === b.h0) return null
  const hs = estado.tempos(h0, b.tam)
  return { tipo: 'mover', blocos: [b], destinos: [[h0, salaPara(estado, b, hs, rnd)]] }
}

// Trocar os horários de dois blocos do mesmo tamanho da mesma turma. A ocupação
// da turma não muda; mudam os professores e as salas envolvidos.
export function trocarBlocos(estado, rnd) {
  const b1 = rnd.escolher(estado.ativos)
  if (b1.h0 < 0) return null
  const colegas = estado.porTurma[estado.inst.atrTurma[b1.a]]
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const b2 = rnd.escolher(colegas)
    if (b2 === b1 || b2.h0 < 0 || b2.tam !== b1.tam || b2.a === b1.a) continue
    const d1 = estado.dominio(b1.a, b1.tam)
    const d2 = estado.dominio(b2.a, b2.tam)
    if (!d1.includes(b2.h0) || !d2.includes(b1.h0)) continue
    return {
      tipo: 'trocar',
      blocos: [b1, b2],
      destinos: [
        [b2.h0, b1.s],
        [b1.h0, b2.s],
      ],
    }
  }
  return null
}

// Trocar a sala de um bloco por outra compatível, sem mudar o horário.
export function trocarSala(estado, rnd) {
  const b = rnd.escolher(estado.ativos)
  if (b.h0 < 0) return null
  const candidatas = estado.inst.atrSalas[b.a]
  if (candidatas.length < 2) return null
  const s = rnd.escolher(candidatas)
  if (s === b.s) return null
  return { tipo: 'sala', blocos: [b], destinos: [[b.h0, s]] }
}

export function sortearMovimento(estado, rnd) {
  const r = rnd.proximo()
  if (r < 0.45) return moverBloco(estado, rnd)
  if (r < 0.85) return trocarBlocos(estado, rnd)
  return trocarSala(estado, rnd)
}
