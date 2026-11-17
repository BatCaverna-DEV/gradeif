// Utilitários dos testes de integração com a base horarios_test.
import bcrypt from 'bcryptjs'
import { db } from '../../src/db/knex.js'
import { env } from '../../src/config/env.js'

const TABELAS = [
  'sessao',
  'aula',
  'versao_grade',
  'importacao',
  'usuario',
  'restricao_config',
  'indisponibilidade',
  'atribuicao_professor',
  'atribuicao',
  'turma',
  'curso',
  'sala',
  'disciplina',
  'professor',
  'horario',
  'turno',
  'periodo_letivo',
]

export async function limparBanco() {
  // Trava de segurança: nunca apagar dados fora da base de teste.
  if (!env.DB_NAME.endsWith('_test')) throw new Error(`Base ${env.DB_NAME} não é de teste`)
  await db.raw('SET FOREIGN_KEY_CHECKS = 0')
  for (const tabela of TABELAS) await db(tabela).truncate()
  await db.raw('SET FOREIGN_KEY_CHECKS = 1')
}

export const GESTOR = { email: 'gestor@teste.local', senha: 'senha-de-teste' }

export async function criarGestor() {
  const [id] = await db('usuario').insert({
    nome: 'Gestor de Teste',
    email: GESTOR.email,
    senha_hash: await bcrypt.hash(GESTOR.senha, 4),
    perfil: 'gestor',
  })
  return id
}

// Período com três turnos e dois tempos por turno, de segunda a sexta.
export async function criarPeriodo(nome = '2027.1') {
  const [periodoId] = await db('periodo_letivo').insert({
    nome,
    data_inicio: '2027-02-01',
    data_fim: '2027-07-15',
  })
  const turnos = {}
  const tempos = {
    Matutino: [
      ['07:00', '07:50'],
      ['07:50', '08:40'],
    ],
    Vespertino: [
      ['13:00', '13:50'],
      ['13:50', '14:40'],
    ],
    Noturno: [
      ['18:30', '19:20'],
      ['19:20', '20:10'],
    ],
  }
  let ordem = 1
  for (const [nomeTurno, horas] of Object.entries(tempos)) {
    const [turnoId] = await db('turno').insert({
      periodo_id: periodoId,
      nome: nomeTurno,
      ordem: ordem++,
    })
    turnos[nomeTurno] = turnoId
    const linhas = []
    for (let dia = 1; dia <= 5; dia++) {
      horas.forEach(([inicio, fim], i) =>
        linhas.push({
          periodo_id: periodoId,
          turno_id: turnoId,
          dia_semana: dia,
          ordem: i + 1,
          hora_inicio: inicio,
          hora_fim: fim,
        })
      )
    }
    await db('horario').insert(linhas)
  }
  return { periodoId, turnos }
}
