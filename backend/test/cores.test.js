import { describe, expect, it } from 'vitest'
import { corAutomatica, corDoProfessor } from '../src/core/cores.js'

describe('cor do professor', () => {
  it('é automática, estável e no formato #rrggbb', () => {
    expect(corAutomatica(7)).toMatch(/^#[0-9a-f]{6}$/)
    expect(corAutomatica(7)).toBe(corAutomatica(7))
  })

  it('dá cores diferentes aos professores de um período', () => {
    const cores = new Set(Array.from({ length: 60 }, (_, i) => corAutomatica(i + 1)))
    expect(cores.size).toBe(60)
  })

  it('usa a cor escolhida no cadastro quando há', () => {
    expect(corDoProfessor(3, '#FF8800')).toBe('#ff8800')
    expect(corDoProfessor(3, null)).toBe(corAutomatica(3))
    expect(corDoProfessor(3, 'vermelho')).toBe(corAutomatica(3))
  })
})
