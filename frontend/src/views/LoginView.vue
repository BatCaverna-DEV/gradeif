<template>
  <div class="entrada">
    <!-- Apresentação (só em telas largas). -->
    <section class="apresentacao d-none d-lg-flex" aria-hidden="true">
      <div class="apresentacao-conteudo">
        <span class="selo"><i class="bi bi-mortarboard" /> IFMA Campus Coelho Neto</span>
        <h2>Horários do campus, montados com menos esforço.</h2>
        <p>
          Importe a oferta, informe as disponibilidades e deixe o GradeIF propor a grade. Depois é
          só ajustar, comparar e publicar.
        </p>
        <ul>
          <li><i class="bi bi-cloud-arrow-up" /> Importação da oferta e dos professores</li>
          <li><i class="bi bi-magic" /> Geração automática respeitando as restrições</li>
          <li><i class="bi bi-grid-3x3-gap" /> Editor com arrastar e soltar</li>
          <li><i class="bi bi-file-earmark-pdf" /> PDFs por turma, professor e sala</li>
        </ul>
      </div>
      <div class="grade-decorativa">
        <span v-for="n in 24" :key="n" :class="`c${n % 6}`" />
      </div>
    </section>

    <!-- Formulário. -->
    <section class="formulario">
      <div class="formulario-caixa">
        <img :src="logo" alt="GradeIF — Sistema de Geração de Horário Escolar" class="logo" />

        <h1 class="h4 mb-1">Bem-vindo de volta</h1>
        <p class="text-body-secondary mb-4">Entre com sua conta institucional.</p>

        <!-- O flex fica dentro: d-flex no BAlert venceria o display:none de quando ele some. -->
        <BAlert :model-value="!!erro" variant="danger" class="small">
          <div class="d-flex gap-2">
            <i class="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{{ erro }}</span>
          </div>
        </BAlert>

        <BForm novalidate @submit.prevent="entrar">
          <BFormGroup label="E-mail" label-for="login-email">
            <div class="campo-icone">
              <i class="bi bi-envelope" aria-hidden="true" />
              <BFormInput
                id="login-email"
                v-model="email"
                type="email"
                autocomplete="username"
                placeholder="seu.email@ifma.edu.br"
                required
                autofocus
              />
            </div>
          </BFormGroup>

          <BFormGroup label="Senha" label-for="login-senha" class="mt-3">
            <div class="campo-icone">
              <i class="bi bi-lock" aria-hidden="true" />
              <BFormInput
                id="login-senha"
                v-model="senha"
                :type="verSenha ? 'text' : 'password'"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="ver-senha"
                :aria-label="verSenha ? 'Ocultar senha' : 'Mostrar senha'"
                :aria-pressed="verSenha"
                @click="verSenha = !verSenha"
              >
                <i :class="verSenha ? 'bi bi-eye-slash' : 'bi bi-eye'" aria-hidden="true" />
              </button>
            </div>
          </BFormGroup>

          <BButton
            type="submit"
            variant="primary"
            size="lg"
            class="w-100 mt-4"
            :disabled="carregando || !podeEnviar"
          >
            <BSpinner v-if="carregando" small class="me-2" />
            {{ carregando ? 'Entrando...' : 'Entrar' }}
          </BButton>
        </BForm>

        <RouterLink :to="{ name: 'consulta' }" class="consulta">
          <i class="bi bi-globe2" aria-hidden="true" />
          <span>
            <strong>Só quer ver o horário?</strong>
            <small>Consulta pública da grade, sem login</small>
          </span>
          <i class="bi bi-arrow-right ms-auto" aria-hidden="true" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BAlert, BForm, BFormGroup, BFormInput, BButton, BSpinner } from 'bootstrap-vue-next'
import { useAuthStore } from '@/stores/auth'
import { mensagemDeErro } from '@/api/http'
import logo from '@/assets/logo-gradeif.webp'

const auth = useAuthStore()
const rota = useRoute()
const router = useRouter()

const email = ref('')
const senha = ref('')
const carregando = ref(false)
const erro = ref('')
const verSenha = ref(false)

const podeEnviar = computed(() => email.value.trim() && senha.value)

async function entrar() {
  if (!podeEnviar.value) return
  carregando.value = true
  erro.value = ''
  try {
    await auth.entrar(email.value.trim(), senha.value)
    const voltar = typeof rota.query.voltar === 'string' ? rota.query.voltar : '/'
    router.replace(voltar.startsWith('/') ? voltar : '/')
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    carregando.value = false
  }
}
</script>

<style scoped>
.entrada {
  min-height: 100vh;
  display: flex;
  background: var(--gf-fundo);
}

/* ---------- Apresentação ---------- */
.apresentacao {
  position: relative;
  flex: 1 1 52%;
  flex-direction: column;
  justify-content: center;
  padding: 4rem 4.5rem;
  overflow: hidden;
  color: #e9f5ec;
  background:
    radial-gradient(1200px 600px at -10% 110%, rgba(61, 156, 28, 0.55), transparent 60%),
    radial-gradient(900px 500px at 110% -10%, rgba(61, 156, 28, 0.35), transparent 60%),
    linear-gradient(160deg, #0a3d1f 0%, #0c4a26 45%, #155f2c 100%);
}
.apresentacao-conteudo {
  position: relative;
  z-index: 1;
  max-width: 520px;
}
.selo {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}
.apresentacao h2 {
  color: #fff;
  font-size: 2.35rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin-bottom: 1rem;
}
.apresentacao p {
  font-size: 1.05rem;
  color: rgba(233, 245, 236, 0.85);
  margin-bottom: 1.75rem;
}
.apresentacao ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.75rem;
}
.apresentacao li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 500;
}
.apresentacao li i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.12);
  color: #b9f19a;
  font-size: 1.05rem;
}

/* Grade decorativa, lembrando os blocos do logotipo. */
.grade-decorativa {
  position: absolute;
  right: -40px;
  bottom: -40px;
  display: grid;
  grid-template-columns: repeat(6, 54px);
  gap: 10px;
  transform: rotate(-12deg);
  opacity: 0.22;
}
.grade-decorativa span {
  height: 34px;
  border-radius: 8px;
  background: #fff;
}
.grade-decorativa .c0 {
  background: #4caf50;
}
.grade-decorativa .c2 {
  background: #fbbc04;
}
.grade-decorativa .c3 {
  background: #4285f4;
}
.grade-decorativa .c5 {
  background: #ea4335;
}

/* ---------- Formulário ---------- */
.formulario {
  flex: 1 1 48%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  background: var(--gf-superficie);
}
.formulario-caixa {
  width: 100%;
  max-width: 400px;
}
.logo {
  display: block;
  width: 100%;
  max-width: 300px;
  height: auto;
  margin: 0 0 2rem -6px;
}
.campo-icone {
  position: relative;
}
.campo-icone > i {
  position: absolute;
  left: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: #8a988f;
  pointer-events: none;
}
.campo-icone :deep(.form-control) {
  padding: 0.7rem 2.75rem 0.7rem 2.6rem;
}
.ver-senha {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #6c7b72;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.45rem;
}
.ver-senha:hover {
  background: var(--gf-verde-suave);
  color: var(--gf-verde);
}
.consulta {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-top: 2rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--gf-borda);
  border-radius: var(--gf-raio);
  color: var(--gf-texto);
  text-decoration: none;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.consulta:hover {
  border-color: var(--gf-verde-borda);
  background: var(--gf-verde-suave);
}
.consulta > i:first-child {
  font-size: 1.4rem;
  color: var(--gf-verde);
}
.consulta span {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.consulta small {
  color: var(--gf-texto-suave);
}

@media (max-width: 991.98px) {
  .formulario {
    background: var(--gf-fundo);
  }
  .formulario-caixa {
    background: var(--gf-superficie);
    padding: 2rem 1.5rem;
    border-radius: 1rem;
    box-shadow: var(--gf-sombra);
  }
  .logo {
    margin: 0 auto 1.75rem;
  }
}
</style>
