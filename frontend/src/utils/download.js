// Baixa um arquivo da API mostrando o erro em texto, em vez de salvar um JSON de
// erro com nome de PDF. O nome vem do Content-Disposition (filename* em UTF-8).

function nomeDoArquivo(cabecalho, padrao) {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho ?? '')
  if (utf8) return decodeURIComponent(utf8[1])
  const simples = /filename="([^"]+)"/i.exec(cabecalho ?? '')
  return simples?.[1] ?? padrao
}

export async function baixarArquivo(url, padrao = 'arquivo') {
  let resposta
  try {
    resposta = await fetch(url, { credentials: 'include' })
  } catch {
    throw new Error('Não foi possível contatar o servidor')
  }
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => null)
    throw new Error(dados?.erro ?? `Erro ${resposta.status} ao gerar o arquivo`)
  }
  const blob = await resposta.blob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = nomeDoArquivo(resposta.headers.get('content-disposition'), padrao)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}
