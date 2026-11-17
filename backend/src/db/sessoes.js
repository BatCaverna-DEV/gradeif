// Armazém de sessões do express-session na tabela "sessao" (F5-09).
// Substitui o MemoryStore, que perde as sessões a cada reinício e não serve
// para produção. Sessões vencidas são apagadas de tempos em tempos.

import session from 'express-session'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { db } from './knex.js'

const OITO_HORAS = 8 * 60 * 60 * 1000

export class ArmazemDeSessoes extends session.Store {
  constructor(db, { intervaloLimpezaMs = 15 * 60 * 1000 } = {}) {
    super()
    this.db = db
    this.limpeza = setInterval(() => this.limpar().catch(() => {}), intervaloLimpezaMs)
    this.limpeza.unref()
  }

  expiracao(sess) {
    const vence = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null
    return vence && !Number.isNaN(vence.getTime()) ? vence : new Date(Date.now() + OITO_HORAS)
  }

  get(sid, cb) {
    this.db('sessao')
      .where({ sid })
      .where('expira_em', '>', new Date())
      .first()
      .then((linha) => cb(null, linha ? JSON.parse(linha.dados) : null))
      .catch((erro) => cb(erro))
  }

  set(sid, sess, cb = () => {}) {
    this.db('sessao')
      .insert({ sid, dados: JSON.stringify(sess), expira_em: this.expiracao(sess) })
      .onConflict('sid')
      .merge()
      .then(() => cb(null))
      .catch((erro) => cb(erro))
  }

  touch(sid, sess, cb = () => {}) {
    this.db('sessao')
      .where({ sid })
      .update({ expira_em: this.expiracao(sess) })
      .then(() => cb(null))
      .catch((erro) => cb(erro))
  }

  destroy(sid, cb = () => {}) {
    this.db('sessao')
      .where({ sid })
      .delete()
      .then(() => cb(null))
      .catch((erro) => cb(erro))
  }

  // Encerra as sessões de um usuário (desativado ou com senha trocada pelo gestor).
  async encerrarDoUsuario(usuarioId, exceto = null) {
    const linhas = await this.db('sessao').select('sid', 'dados')
    const sids = linhas
      .filter((l) => l.sid !== exceto && JSON.parse(l.dados)?.usuario?.id === usuarioId)
      .map((l) => l.sid)
    if (sids.length) await this.db('sessao').whereIn('sid', sids).delete()
    return sids.length
  }

  async limpar() {
    const n = await this.db('sessao').where('expira_em', '<=', new Date()).delete()
    if (n) logger.debug(`${n} sessão(ões) vencida(s) apagada(s)`)
  }

  fechar() {
    clearInterval(this.limpeza)
  }
}

let padrao = null
export function armazemPadrao() {
  if (env.NODE_ENV === 'test') return null
  padrao ??= new ArmazemDeSessoes(db)
  return padrao
}
