# Guia de uso

## Decks

Crie decks na tela inicial. Use `Pai::Filho` no nome para criar subdecks. Os números ao lado de cada deck são cartas novas (azul), em aprendizado (vermelho) e para revisar (verde) hoje. O dia de estudo vira às 4h da manhã, como no Anki.

Em *Opções* do deck: novas por dia, revisões por dia, retenção desejada (FSRS), intervalo máximo e passos de aprendizado. Os limites valem para o deck com os subdecks.

## Tipos de nota

- **Basic**: frente e verso.
- **Basic (and reversed card)**: gera também a carta inversa (verso → frente) quando os dois campos estão preenchidos.
- **Cloze**: lacunas com `{{c1::texto}}` ou `{{c1::texto::dica}}`. Cada número gera uma carta.

## Pronúncia

O botão de alto-falante lê o primeiro campo da nota em inglês. Em *Ajustes* dá para tocar automaticamente na frente ou no verso e ajustar a velocidade. Se a carta tem áudio próprio (`[sound:...]`, comum em decks importados), ele toca no lugar da voz sintética.

## Importar do Anki

No Anki: *Arquivo → Exportar → Pacote de deck (.apkg)*, incluindo a mídia. No Phanki: *Ajustes → Importar do Anki*.

- O progresso e o histórico são convertidos para FSRS. Marque "começar do zero" para importar tudo como cartas novas.
- Reimportar o mesmo deck atualiza as notas sem duplicar e sem mexer no agendamento de cartas que já existem.
- A importação precisa de conexão com o servidor.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `Espaço` / `Enter` | Mostrar resposta; com a resposta à mostra, responder "Bom" |
| `1` `2` `3` `4` | Errei, Difícil, Bom, Fácil |
| `R` | Repetir áudio |
| `U` ou `Ctrl/⌘+Z` | Desfazer a última resposta |
| `Ctrl/⌘+Enter` | Salvar no editor |
| `Ctrl/⌘+Shift+C` | Criar lacuna cloze com o texto selecionado |
