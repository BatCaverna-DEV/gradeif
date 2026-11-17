// Executa o solver fora da thread da API (worker_threads). Recebe o problema
// pronto e um buffer compartilhado: quando a API grava 1 nele, o solver para na
// próxima checagem e devolve a melhor solução até ali.

import { parentPort, workerData } from 'node:worker_threads'
import { resolver } from '../core/index.js'

const parar = new Int32Array(workerData.sinal)

try {
  const solucao = resolver(workerData.problema, {
    aoProgresso: (info) => parentPort.postMessage({ tipo: 'progresso', info }),
    deveParar: () => Atomics.load(parar, 0) === 1,
  })
  parentPort.postMessage({ tipo: 'fim', solucao })
} catch (erro) {
  parentPort.postMessage({
    tipo: 'erro',
    mensagem: erro.message,
    detalhes: erro.detalhes ?? erro.issues?.map((i) => `${i.path.join('.')}: ${i.message}`),
  })
}
