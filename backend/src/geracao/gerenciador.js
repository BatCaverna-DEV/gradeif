// F3-03 — Gerenciador de jobs de geração.
//
// Um job por período, com estado em memória:
//   preparando → executando → gravando → concluido
//                           ↘ cancelado | erro
// O solver roda num worker_thread, para não travar a API. O cancelamento grava 1
// num SharedArrayBuffer que o solver consulta; com "salvar", a melhor solução até
// ali é gravada, sem ele é descartada.
// Cada geração preenche um horário existente (versao_grade), com as atribuições
// dele; as aulas fixadas do horário ficam onde estão e o resto é substituído.
// O último job de cada período fica guardado até o próximo começar, para a tela
// mostrar o resultado mesmo depois de recarregar. Reiniciar a API perde os jobs.

import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { logger } from '../config/logger.js'
import { db } from '../db/knex.js'
import { ErroConflito, ErroNaoEncontrado } from '../erros.js'
import { montarProblema } from '../servicos/problema.js'
import { gravarSolucao } from '../servicos/versoes.js'

const ATIVOS = new Set(['preparando', 'executando', 'gravando'])
// Folga além do tempo limite antes de forçar a parada de um worker que não responde.
const FOLGA_MS = 15_000

export class Gerenciador {
  constructor({ arquivoWorker = new URL('./worker.js', import.meta.url) } = {}) {
    this.arquivoWorker = arquivoWorker
    this.jobs = new Map()
    this.assinantes = new Map()
  }

  // Visão pública do job (sem worker, buffers e timers).
  publico(job) {
    if (!job) return null
    return {
      id: job.id,
      periodoId: job.periodoId,
      estado: job.estado,
      ativo: ATIVOS.has(job.estado),
      nome: job.nome,
      opcoes: job.opcoes,
      criadoEm: job.criadoEm,
      decorridoMs: (job.fimEm ?? Date.now()) - job.criadoEm,
      construcao: job.construcao,
      progresso: job.progresso,
      avisos: job.avisos,
      cancelamento: job.cancelamento,
      resultado: job.resultado,
      erro: job.erro,
    }
  }

  obter(periodoId) {
    return this.publico(this.jobs.get(periodoId))
  }

  // fn(jobPublico) a cada mudança; devolve a função que cancela a assinatura.
  assinar(periodoId, fn) {
    if (!this.assinantes.has(periodoId)) this.assinantes.set(periodoId, new Set())
    const lista = this.assinantes.get(periodoId)
    lista.add(fn)
    return () => lista.delete(fn)
  }

  emitir(job) {
    const visao = this.publico(job)
    for (const fn of this.assinantes.get(job.periodoId) ?? []) {
      try {
        fn(visao)
      } catch (erro) {
        logger.warn({ err: erro }, 'Falha ao avisar assinante da geração')
      }
    }
  }

  mudar(job, estado, extra = {}) {
    Object.assign(job, { estado }, extra)
    if (!ATIVOS.has(estado)) {
      job.fimEm = Date.now()
      clearTimeout(job.guarda)
    }
    this.emitir(job)
  }

  async iniciar(periodoId, { versaoId, tempoLimiteSegundos = 60, semente } = {}) {
    const atual = this.jobs.get(periodoId)
    if (atual && ATIVOS.has(atual.estado)) {
      throw new ErroConflito('Já existe uma geração em andamento neste período')
    }
    const versao = await db('versao_grade')
      .where({ id: versaoId ?? 0, periodo_id: periodoId })
      .first()
    if (!versao) throw new ErroNaoEncontrado('Horário não encontrado neste período')
    if (versao.publicada) {
      throw new ErroConflito(
        'O horário publicado não pode ser regerado; duplique-o para gerar de novo'
      )
    }
    // Pode ter começado outra geração enquanto o horário era consultado.
    const outra = this.jobs.get(periodoId)
    if (outra && ATIVOS.has(outra.estado)) {
      throw new ErroConflito('Já existe uma geração em andamento neste período')
    }
    const job = {
      id: randomUUID(),
      periodoId,
      versaoId: versao.id,
      estado: 'preparando',
      nome: versao.nome,
      opcoes: {
        versaoId: versao.id,
        tempoLimiteSegundos,
        semente: semente?.trim() || String(Date.now()),
      },
      criadoEm: Date.now(),
      construcao: null,
      progresso: null,
      avisos: [],
      cancelamento: null,
      resultado: null,
      erro: null,
      sinal: new SharedArrayBuffer(4),
    }
    this.jobs.set(periodoId, job)
    this.emitir(job)
    this.preparar(job)
    return this.publico(job)
  }

  async preparar(job) {
    try {
      const { problema, avisos } = await montarProblema(job.periodoId, {
        versaoId: job.versaoId,
        opcoes: {
          semente: job.opcoes.semente,
          tempoLimiteMs: job.opcoes.tempoLimiteSegundos * 1000,
        },
      })
      job.avisos = avisos
      if (job.cancelamento) return this.mudar(job, 'cancelado')
      this.executar(job, problema)
    } catch (erro) {
      this.falhar(job, erro.message, erro.detalhes)
    }
  }

  executar(job, problema) {
    const worker = new Worker(this.arquivoWorker, { workerData: { problema, sinal: job.sinal } })
    job.worker = worker
    let terminou = false
    // Se o worker não devolver nada depois do tempo limite, pede parada e, por fim, encerra.
    job.guarda = setTimeout(
      () => {
        Atomics.store(new Int32Array(job.sinal), 0, 1)
        job.guarda = setTimeout(() => worker.terminate(), FOLGA_MS)
      },
      job.opcoes.tempoLimiteSegundos * 1000 + FOLGA_MS
    )

    worker.on('message', async (msg) => {
      if (msg.tipo === 'progresso') {
        if (msg.info.etapa === 'construcao') job.construcao = msg.info
        else job.progresso = msg.info
        this.emitir(job)
        return
      }
      terminou = true
      clearTimeout(job.guarda)
      worker.terminate()
      if (msg.tipo === 'erro') return this.falhar(job, msg.mensagem, msg.detalhes)
      if (job.cancelamento === 'descartar') return this.mudar(job, 'cancelado')
      await this.gravar(job, msg.solucao)
    })
    worker.on('error', (erro) => {
      terminou = true
      this.falhar(job, `Falha no solver: ${erro.message}`)
    })
    worker.on('exit', () => {
      job.worker = null
      if (!terminou && ATIVOS.has(job.estado)) {
        if (job.cancelamento === 'descartar') this.mudar(job, 'cancelado')
        else this.falhar(job, 'O solver foi encerrado antes de terminar')
      }
    })
    this.mudar(job, 'executando')
  }

  async gravar(job, solucao) {
    this.mudar(job, 'gravando')
    try {
      const versao = await gravarSolucao(job.periodoId, job.versaoId, solucao, {
        detalhes: {
          tempoLimiteSegundos: job.opcoes.tempoLimiteSegundos,
          avisos: job.avisos,
          cancelada: !!job.cancelamento,
        },
      })
      this.mudar(job, 'concluido', {
        resultado: {
          versao,
          valida: solucao.valida,
          custoRigido: solucao.custoRigido,
          pontuacao: solucao.pontuacao,
          naoAlocados: solucao.naoAlocados.length,
          iteracoes: solucao.iteracoes,
          tempoMs: solucao.tempoMs,
          motivoFim: solucao.motivoFim,
        },
      })
    } catch (erro) {
      logger.error({ err: erro }, 'Falha ao gravar o horário gerado')
      this.falhar(job, `Falha ao gravar o horário: ${erro.message}`)
    }
  }

  falhar(job, mensagem, detalhes) {
    if (!ATIVOS.has(job.estado)) return
    this.mudar(job, 'erro', { erro: { mensagem, detalhes: detalhes ?? [] } })
  }

  // salvar: grava a melhor solução até agora; senão, descarta.
  cancelar(periodoId, { salvar = false } = {}) {
    const job = this.jobs.get(periodoId)
    if (!job || !ATIVOS.has(job.estado)) {
      throw new ErroNaoEncontrado('Não há geração em andamento neste período')
    }
    if (job.estado === 'gravando') return this.publico(job)
    job.cancelamento = salvar ? 'salvar' : 'descartar'
    Atomics.store(new Int32Array(job.sinal), 0, 1)
    this.emitir(job)
    return this.publico(job)
  }

  // Encerramento da API: para todos os workers sem gravar.
  async encerrar() {
    for (const job of this.jobs.values()) {
      if (!ATIVOS.has(job.estado)) continue
      job.cancelamento = 'descartar'
      await job.worker?.terminate()
    }
  }
}

export const gerenciador = new Gerenciador()
