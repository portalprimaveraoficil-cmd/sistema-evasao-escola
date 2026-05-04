const API = window.location.origin;

const graficos = {
    distribuicaoRisco: null,
    curso: null,
    faixaEtaria: null,
    fatoresRisco: null,
    genero: null,
    semestre: null,
    periodo: null,
    projecao: null,
    motivos: null,
    fatoresAltoRisco: null,
    fatoresMedioRisco: null,
    fatoresBaixoRisco: null
};

let paginaAtual = 1;
let consultaRealizada = false;

window.opcoesValidas = { turmas: [], cursos: [], semestres: [] };

window.onload = async () => {
    Chart.defaults.color = '#ffffff';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';

    await carregarDashboardCompleto();
    inicializarFiltrosPeriodo(); 
    configurarEventosConsulta();
    atualizarTextoBotaoSalvar();
    limparTabela();

    // Adiciona evento ao novo input de arquivo
    const fileInput = document.getElementById('arquivoCSV');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const fileName = e.target.files[0] ? e.target.files[0].name : "UPLOAD CSV";
            const fileNameEl = document.getElementById('file-name');
            const statusTextEl = document.getElementById('status-text');
            if (fileNameEl) fileNameEl.textContent = fileName;
            if (statusTextEl) statusTextEl.textContent = "";
        });
    }
};

// ==============================
// UTILITÁRIOS
// ==============================
function numero(v) {
    const n = Number(String(v ?? "").replace(",", "."));
    return isNaN(n) ? 0 : n;
}

function mostrarMensagem(texto, tipo = "sucesso") {
    const box = document.getElementById("mensagemSistema");
    if (!box) {
        alert(texto);
        return;
    }

    box.textContent = texto;
    box.className = `mensagem-sistema ${tipo}`;
    box.style.display = "block";

    setTimeout(() => {
        box.style.display = "none";
    }, 4000);
}

function mostrarMensagemCadastro(texto, tipo = "sucesso") {
    const box = document.getElementById("mensagemCadastro");
    if (!box) {
        mostrarMensagem(texto, tipo);
        return;
    }

    box.textContent = texto;
    if (tipo === "sucesso") {
        box.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
        box.style.color = "#10b981";
        box.style.borderColor = "rgba(16, 185, 129, 0.3)";
    } else if (tipo === "erro") {
        box.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
        box.style.color = "#ef4444";
        box.style.borderColor = "rgba(239, 68, 68, 0.3)";
    } else {
        box.style.backgroundColor = "rgba(245, 158, 11, 0.1)";
        box.style.color = "#f59e0b";
        box.style.borderColor = "rgba(245, 158, 11, 0.3)";
    }
    box.style.display = "block";

    setTimeout(() => {
        box.style.display = "none";
    }, 4000);
}

function mostrarMensagemUpload(texto, tipo = "sucesso") {
    const box = document.getElementById("mensagemUpload");
    if (!box) {
        mostrarMensagem(texto, tipo);
        return;
    }

    box.textContent = texto;
    if (tipo === "sucesso") {
        box.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
        box.style.color = "#10b981";
        box.style.border = "1px solid rgba(16, 185, 129, 0.3)";
    } else if (tipo === "erro") {
        box.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
        box.style.color = "#ef4444";
        box.style.border = "1px solid rgba(239, 68, 68, 0.3)";
    } else {
        box.style.backgroundColor = "rgba(245, 158, 11, 0.1)";
        box.style.color = "#f59e0b";
        box.style.border = "1px solid rgba(245, 158, 11, 0.3)";
    }
    box.style.display = "block";

    setTimeout(() => {
        box.style.display = "none";
    }, 4000);
}

function badgeNivel(nivel) {
    const valor = String(nivel || "").toUpperCase();
    if (valor === "ALTO") return `<span class="badge badge-alto">ALTO</span>`;
    if (valor === "MEDIO") return `<span class="badge badge-medio">MEDIO</span>`;
    if (valor === "BAIXO") return `<span class="badge badge-baixo">BAIXO</span>`;
    return `<span class="badge" style="background:#e2e8f0; color:#475569; border:1px solid #cbd5e1;">${valor}</span>`;
}

function obterContextoCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    return canvas.getContext("2d");
}

function destruirGrafico(chave) {
    if (graficos[chave]) {
        graficos[chave].destroy();
        graficos[chave] = null;
    }
}

function formatarNumero(v, casas = 2) {
    return Number(v || 0).toFixed(casas);
}

// ==============================
// CONSULTA
// ==============================
function obterFiltrosConsulta() {
    return {
        nome: document.getElementById("filtroNome")?.value.trim() || "",
        matricula: document.getElementById("filtroMatricula")?.value.trim() || "",
        turma: document.getElementById("filtroTurma")?.value.trim() || "",
        curso: document.getElementById("filtroCurso")?.value.trim() || "",
        nivel_risco: document.getElementById("filtroNivelRisco")?.value.trim() || ""
    };
}

function configurarEventosConsulta() {
    const btnBuscar = document.getElementById("btnBuscarAlunos");
    if (btnBuscar) {
        btnBuscar.addEventListener("click", () => carregarAlunos());
    }

    const btnLimpar = document.getElementById("btnLimparFiltros");
    if (btnLimpar) {
        btnLimpar.addEventListener("click", limparFiltros);
    }
}

function obterAlunoEditandoId() {
    return document.getElementById("alunoEditandoId")?.value?.trim() || "";
}

function estaEditandoAluno() {
    return obterAlunoEditandoId() !== "";
}

function atualizarTextoBotaoSalvar() {
    const botaoSalvar = document.querySelector('button[onclick="salvarAluno()"]');
    if (!botaoSalvar) return;
    botaoSalvar.textContent = estaEditandoAluno() ? "Atualizar" : "Salvar";
}

// ==============================
// LIMPAR/PREENCHER FORM
// ==============================
function limparCampos() {
    [
        "novoNome",
        "novoMatricula",
        "novoTurma",
        "novoCurso",
        "novoSemestre",
        "novoIdade",
        "novoGPA",
        "novoFrequencia",
        "novoHorasEstudo",
        "novoDistancia",
        "novaDataReferencia"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const genero = document.getElementById("novoGenero");
    const estresse = document.getElementById("novoEstresse");
    const resultado = document.getElementById("resultadoArea");
    const editandoId = document.getElementById("alunoEditandoId");
    const msgCadastro = document.getElementById("mensagemCadastro");

    if (genero) genero.value = "true";
    if (estresse) estresse.value = "2";
    if (editandoId) editandoId.value = "";

    if (resultado) {
        resultado.style.display = "none";
        resultado.innerHTML = "";
        resultado.className = "";
    }

    if (msgCadastro) {
        msgCadastro.style.display = "none";
        msgCadastro.textContent = "";
    }

    atualizarTextoBotaoSalvar();
    sugerirDadosNovoAluno();

        // Linhas comentadas para evitar que a tela pule para baixo roubando 
        // o foco do campo de cadastro ao resetar ou salvar
        // const nome = document.getElementById("novoNome");
        // if (nome) nome.focus();
}

async function sugerirDadosNovoAluno() {
    if (estaEditandoAluno()) return;

    try {
        const res = await fetch(`${API}/sugestao_dados`);
        if (res.ok) {
            const data = await res.json();
            const mat = document.getElementById("novoMatricula");
            if (mat && !mat.value) mat.value = data.matricula;
            
            const ref = document.getElementById("novaDataReferencia");
            if (ref && !ref.value) ref.value = data.data_referencia;
        }
    } catch (e) {
        console.warn("Erro ao buscar sugestão de dados", e);
    }
}

async function verificarMatriculaDuplicada() {
    const inputMatricula = document.getElementById("novoMatricula");
    const matricula = inputMatricula?.value.trim();
    if (!matricula) {
        if (inputMatricula) inputMatricula.style.borderColor = "";
        return;
    }

    const ignorarId = obterAlunoEditandoId();
    const params = new URLSearchParams({ matricula });
    if (ignorarId) params.append("ignorar_id", ignorarId);

    try {
        const res = await fetch(`${API}/verificar_matricula?${params.toString()}`);
        if (res.ok) {
            const json = await res.json();
            if (json.existe) {
                mostrarMensagemCadastro(`Atenção: Matrícula duplicada. O aluno "${json.nome}" já usa este número.`, "erro");
                inputMatricula.style.borderColor = "var(--danger)";
            } else {
                inputMatricula.style.borderColor = "var(--secondary)";
                setTimeout(() => { if(inputMatricula.style.borderColor === "var(--secondary)") inputMatricula.style.borderColor = ""; }, 2000);
            }
        }
    } catch (e) {
        console.warn("Erro ao verificar matrícula", e);
    }
}

async function carregarOpcoesFormulario() {
    try {
        const res = await fetch(`${API}/opcoes_formulario`);
        if (res.ok) {
            const data = await res.json();
            
            const listaTurmas = document.getElementById("listaTurmas");
            if (listaTurmas) {
                listaTurmas.innerHTML = data.turmas.map(t => `<option value="${t}">`).join("");
            }
            
            const listaCursos = document.getElementById("listaCursos");
            if (listaCursos) {
                listaCursos.innerHTML = data.cursos.map(c => `<option value="${c}">`).join("");
            }
            
            const listaSemestres = document.getElementById("listaSemestres");
            if (listaSemestres) {
                listaSemestres.innerHTML = data.semestres.map(s => `<option value="${s}">`).join("");
            }
            
            window.opcoesValidas = data;
        }
    } catch (e) {
        console.warn("Erro ao carregar opções do formulário", e);
    }
}

function preencherFormulario(aluno) {
    const editandoId = document.getElementById("alunoEditandoId");
    if (editandoId) editandoId.value = aluno.ID ?? "";

    const mapa = {
        novoNome: aluno.Nome ?? "",
        novoMatricula: aluno.Matricula ?? "",
        novoTurma: aluno.Turma ?? "",
        novoCurso: aluno.Curso ?? "",
        novoSemestre: aluno.Semestre ?? "",
        novoIdade: aluno.Age ?? "",
        novoGPA: aluno.GPA ?? "",
        novoFrequencia: aluno.Attendance_Rate ?? "",
        novoHorasEstudo: aluno.Study_Hours_per_Day ?? "",
        novoDistancia: aluno.Travel_Time_Minutes ?? "",
        novoEstresse: aluno.Stress_Index ?? "2",
        novaDataReferencia: aluno.Data_Referencia ?? ""
    };

    Object.entries(mapa).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
    });

    const genero = document.getElementById("novoGenero");
    if (genero) {
        const valorGenero = String(aluno.Gender_Male ?? "").toLowerCase();
        genero.value = (valorGenero === "1" || valorGenero === "true") ? "true" : "false";
    }

    atualizarTextoBotaoSalvar();
}

// ==============================
// VALIDAÇÃO
// ==============================
function validarCampos() {
    const obrigatorios = [
        { id: "novoNome", nome: "Nome" },
        { id: "novoMatricula", nome: "Matrícula" },
        { id: "novoTurma", nome: "Turma" },
        { id: "novoCurso", nome: "Curso" },
        { id: "novoSemestre", nome: "Semestre" },
        { id: "novoIdade", nome: "Idade" },
        { id: "novoGPA", nome: "Méd. de notas-GPA" },
        { id: "novoFrequencia", nome: "Frequência" },
        { id: "novoHorasEstudo", nome: "Horas de estudo" },
        { id: "novoDistancia", nome: "Tempo de deslocamento" }
    ];

    for (const campo of obrigatorios) {
        const el = document.getElementById(campo.id);
        if (!el || !String(el.value).trim()) {
            mostrarMensagemCadastro(`O campo ${campo.nome} é obrigatório.`, "erro");
            if (el) el.focus();
            return false;
        }
    }

    const idade = numero(document.getElementById("novoIdade").value);
    const gpa = numero(document.getElementById("novoGPA").value);
    const frequencia = numero(document.getElementById("novoFrequencia").value);
    const horas = numero(document.getElementById("novoHorasEstudo").value);
    const deslocamento = numero(document.getElementById("novoDistancia").value);

    if (idade < 0) {
        mostrarMensagemCadastro("Idade inválida.", "erro");
        return false;
    }

    if (gpa < 0 || gpa > 10) {
        mostrarMensagemCadastro("A Méd. de notas-GPA deve estar entre 0 e 10.", "erro");
        return false;
    }

    if (frequencia < 0 || frequencia > 100) {
        mostrarMensagemCadastro("A frequência deve estar entre 0 e 100.", "erro");
        return false;
    }

    if (horas < 0) {
        mostrarMensagemCadastro("Horas de estudo inválidas.", "erro");
        return false;
    }

    if (deslocamento < 0) {
        mostrarMensagemCadastro("Tempo de deslocamento inválido.", "erro");
        return false;
    }

    // Validação de opções restritas (Turma, Curso, Semestre)
    if (window.opcoesValidas) {
        const turma = document.getElementById("novoTurma")?.value.trim();
        if (turma && window.opcoesValidas.turmas.length > 0 && !window.opcoesValidas.turmas.includes(turma)) {
            mostrarMensagemCadastro("Turma não cadastrada na base. Selecione uma opção existente.", "erro");
            return false;
        }
        
        const curso = document.getElementById("novoCurso")?.value.trim();
        if (curso && window.opcoesValidas.cursos.length > 0 && !window.opcoesValidas.cursos.includes(curso)) {
            mostrarMensagemCadastro("Curso não cadastrado na base. Selecione uma opção existente.", "erro");
            return false;
        }
        
        const semestre = document.getElementById("novoSemestre")?.value.trim();
        if (semestre && window.opcoesValidas.semestres.length > 0 && !window.opcoesValidas.semestres.includes(semestre)) {
            mostrarMensagemCadastro("Semestre não cadastrado na base. Selecione uma opção existente.", "erro");
            return false;
        }
    }

    return true;
}

// ==============================
// DADOS DO FORM
// ==============================
function coletarDados() {
    return {
        Nome: document.getElementById("novoNome")?.value.trim() || "",
        Matricula: document.getElementById("novoMatricula")?.value.trim() || "",
        Turma: document.getElementById("novoTurma")?.value.trim() || "",
        Curso: document.getElementById("novoCurso")?.value.trim() || "",
        Semestre: document.getElementById("novoSemestre")?.value.trim() || "",
        Age: parseInt(document.getElementById("novoIdade")?.value) || 0,
        GPA: numero(document.getElementById("novoGPA")?.value),
        Attendance_Rate: numero(document.getElementById("novoFrequencia")?.value),
        Study_Hours_per_Day: numero(document.getElementById("novoHorasEstudo")?.value),
        Travel_Time_Minutes: numero(document.getElementById("novoDistancia")?.value),
        Stress_Index: parseInt(document.getElementById("novoEstresse")?.value) || 0,
        Gender_Male: document.getElementById("novoGenero")?.value === "true",
        Data_Referencia: document.getElementById("novaDataReferencia")?.value || ""
    };
}

// ==============================
// DASHBOARD
// ==============================
async function carregarDashboardCompleto(options = {}) {
    const { isFromUpload = false, silentMode = false } = options;

    const statusLabel = document.getElementById("uploadStatusText");
    const uploadBar = document.getElementById("uploadProgressBar");
    const uploadPercent = document.getElementById("uploadPercent");

    const hideAnimation = isFromUpload || silentMode;

    // 1. Inicia o visual de carregamento e verifica a Base
    if (!hideAnimation) {
        if (statusLabel) {
            statusLabel.innerText = "Sincronizando Dados...";
            statusLabel.style.color = "#2563eb"; 
        }
        if (uploadBar) {
            uploadBar.style.width = `50%`;
            uploadBar.style.backgroundColor = "#2563eb";
        }
        if (uploadPercent) {
            uploadPercent.innerText = `...`;
        }
    }
    
    // Dispara as requisições à API em paralelo para carregamento mais rápido
    const promises = [
        atualizarEstadoIA(), // Força buscar as métricas reais treinadas no servidor
        carregarInteligenciaIA(),
        atualizarIndicadores(),
        atualizarGraficosResumo(),
        carregarOpcoesFormulario()
    ];

    // 3. Aguarda o carregamento paralelo de todos os KPIs e Gráficos
    const [total] = await Promise.all([
        atualizarKPIs(),
        ...promises
    ]);

    // 4. Finaliza a barra de sincronização visual
    if (!hideAnimation) {
        if (total > 0) {
            if (uploadBar) {
                uploadBar.style.width = "100%";
                uploadBar.style.backgroundColor = "#10b981"; // Verde
            }
            if (statusLabel) {
                statusLabel.innerText = "Base Carregada";
                statusLabel.style.color = "#10b981";
            }
            if (uploadPercent) uploadPercent.innerText = "100%";
        } else {
            if (uploadBar) {
                uploadBar.style.width = "0%";
                uploadBar.style.backgroundColor = "#94a3b8"; // Cinza
            }
            if (statusLabel) {
                statusLabel.innerText = "Carregar Base";
                statusLabel.style.color = "#64748b";
            }
            if (uploadPercent) uploadPercent.innerText = "0%";
        }
    }

    return total;
}

async function atualizarKPIs() {
    try {
        const resp = await fetch(`${API}/estatisticas?t=${Date.now()}`);
        const d = await resp.json();

        // Atualiza os textos numéricos
        const totalAlunos = document.getElementById("totalAlunos");
        const totalRisco = document.getElementById("totalRisco");
        const taxaEvasao = document.getElementById("taxaEvasao");
        const taxaRetencao = document.getElementById("taxaRetencao");
        const alto = document.getElementById("altoRisco");
        const medio = document.getElementById("medioRisco");
        const baixo = document.getElementById("baixoRisco");

        if (totalAlunos) totalAlunos.innerText = d.total_estudantes || 0;
        if (totalRisco) totalRisco.innerText = d.total_risco || 0;
        if (taxaEvasao) taxaEvasao.innerText = `${d.percentual_risco || 0}%`;

        const percRetencao = (d.total_estudantes || 0) > 0 ? 100 - (d.percentual_risco || 0) : 0;
        if (taxaRetencao) taxaRetencao.innerText = `${formatarNumero(percRetencao, 2)}%`;

        if (alto) alto.innerText = d.alto_risco || 0;
        if (medio) medio.innerText = d.medio_risco || 0;
        if (baixo) baixo.innerText = d.baixo_risco || 0;

        // Calcula percentuais dinâmicos para as Roscas (Gauges)
        const tot = d.total_estudantes || 0;
        const totRisco = d.total_risco || 0;
        const altoV = d.alto_risco || 0;
        const medioV = d.medio_risco || 0;
        const baixoV = d.baixo_risco || 0;

        const percRisco = tot > 0 ? ((totRisco / tot) * 100).toFixed(1) : 0;
        const percAlto = totRisco > 0 ? ((altoV / totRisco) * 100).toFixed(1) : 0;
        const percMedio = totRisco > 0 ? ((medioV / totRisco) * 100).toFixed(1) : 0;
        const percBaixo = tot > 0 ? ((baixoV / tot) * 100).toFixed(1) : 0;

        // Atualiza as variáveis CSS para animar as barras circulares
        const gaugeTaxa = document.getElementById("gaugeTaxaRisco");
        const gaugeRetencao = document.getElementById("gaugeTaxaRetencao");
        const ringTotal = document.querySelector("#cardTotalEstudantes .mini-kpi-ring");
        const ringRisco = document.querySelector("#cardTotalRisco .mini-kpi-ring");
        const ringAlto = document.querySelector("#cardAltoRisco .mini-kpi-ring");
        const ringMedio = document.querySelector("#cardMedioRisco .mini-kpi-ring");
        const ringBaixo = document.querySelector("#cardBaixoRisco .mini-kpi-ring");

        // Lógica de Status das Cores e Valores dos Círculos (KPIs) baseado na existência de dados
        const cardTotal = document.getElementById("cardTotalEstudantes");
        const cardRisco = document.getElementById("cardTotalRisco");
        const cardAlto = document.getElementById("cardAltoRisco");
        const cardMedio = document.getElementById("cardMedioRisco");
        const cardBaixo = document.getElementById("cardBaixoRisco");

        if (tot > 0) {
            // Taxa de Risco
            if (gaugeTaxa) {
                gaugeTaxa.classList.remove("gauge-gray");
                gaugeTaxa.classList.add("gauge-red");
                gaugeTaxa.style.setProperty("--value", d.percentual_risco || 0);
            }
            // Taxa de Retenção
            if (gaugeRetencao) {
                gaugeRetencao.classList.remove("gauge-gray");
                gaugeRetencao.classList.add("gauge-blue");
                gaugeRetencao.style.setProperty("--value", percRetencao);
            }
            // Total Estudantes
            if (cardTotal) {
                cardTotal.classList.remove("gauge-gray");
                cardTotal.classList.add("gauge-blue");
                if (ringTotal) ringTotal.style.setProperty("--value", 100);
            }
            // Total em Risco
            if (cardRisco) {
                cardRisco.classList.remove("gauge-gray");
                cardRisco.classList.add("gauge-yellow");
                if (ringRisco) ringRisco.style.setProperty("--value", percRisco);
            }
            // Alto Risco
            if (cardAlto) {
                cardAlto.classList.remove("gauge-gray");
                cardAlto.classList.add("gauge-red");
                if (ringAlto) ringAlto.style.setProperty("--value", percAlto);
            }
            // Médio Risco
            if (cardMedio) {
                cardMedio.classList.remove("gauge-gray");
                cardMedio.classList.add("gauge-orange");
                if (ringMedio) ringMedio.style.setProperty("--value", percMedio);
            }
            // Baixo Risco
            if (cardBaixo) {
                cardBaixo.classList.remove("gauge-gray");
                cardBaixo.classList.add("gauge-green");
                if (ringBaixo) ringBaixo.style.setProperty("--value", percBaixo);
            }
        } else {
            // Quando não há base (tot == 0), todos ficam cinzas e com valor 0
            if (gaugeTaxa) {
                gaugeTaxa.classList.remove("gauge-red");
                gaugeTaxa.classList.add("gauge-gray");
                gaugeTaxa.style.setProperty("--value", 0);
            }
            if (gaugeRetencao) {
                gaugeRetencao.classList.remove("gauge-blue");
                gaugeRetencao.classList.add("gauge-gray");
                gaugeRetencao.style.setProperty("--value", 0);
            }
            [{el: cardTotal, ring: ringTotal, cls: "gauge-blue"}, {el: cardRisco, ring: ringRisco, cls: "gauge-yellow"}, {el: cardAlto, ring: ringAlto, cls: "gauge-red"}, {el: cardMedio, ring: ringMedio, cls: "gauge-orange"}, {el: cardBaixo, ring: ringBaixo, cls: "gauge-green"}].forEach(item => {
                if (item.el) { item.el.classList.remove(item.cls); item.el.classList.add("gauge-gray"); }
                if (item.ring) item.ring.style.setProperty("--value", 0);
            });
        }

        return tot;
    } catch (e) {
        console.warn("Falha ao carregar KPIs", e);
        return 0;
    }
}

async function atualizarIndicadores() {
    try {
        const resp = await fetch(`${API}/indicadores?t=${Date.now()}`);
        const d = await resp.json();

        const gpa = document.getElementById("indicadorGPA");
        const freq = document.getElementById("indicadorFrequencia");
        const stress = document.getElementById("indicadorEstresse");
        const horas = document.getElementById("indicadorHorasEstudo");
        const desloc = document.getElementById("indicadorDeslocamento");
        const idade = document.getElementById("indicadorIdade");

        if (gpa) gpa.innerText = formatarNumero(d.GPA, 2);
        if (freq) freq.innerText = `${formatarNumero(d.Attendance_Rate, 2)}%`;
        if (stress) stress.innerText = formatarNumero(d.Stress_Index, 2);
        if (horas) horas.innerText = formatarNumero(d.Study_Hours_per_Day, 2);
        if (desloc) desloc.innerText = `${formatarNumero(d.Travel_Time_Minutes, 2)} min`;
        if (idade) idade.innerText = formatarNumero(d.Age, 2);
    } catch (e) {
        console.warn("Erro ao carregar indicadores", e);
    }
}

async function atualizarGraficosResumo() {
    try {
        const resp = await fetch(`${API}/graficos?t=${Date.now()}`);
        const d = await resp.json();

        renderizarGraficoDistribuicaoRisco(
            d.distribuicao_risco?.labels || [],
            d.distribuicao_risco?.valores || []
        );

        renderizarGraficoCurso(
            d.evasao_curso?.labels || [],
            d.evasao_curso?.valores || []
        );

        renderizarGraficoFaixaEtaria(
            d.evasao_faixa_etaria?.labels || [],
            d.evasao_faixa_etaria?.valores || []
        );

        renderizarGraficoFatoresRisco(
            d.fatores_risco?.labels || [],
            d.fatores_risco?.valores || [],
            d.fatores_risco?.total_risco
        );

        renderizarGraficoGenero(
            d.evasao_genero?.labels || [],
            d.evasao_genero?.valores || [],
            d.evasao_genero?.totais || []
        );

        renderizarGraficoSemestre(
            d.evasao_semestre?.labels || [],
            d.evasao_semestre?.valores || []
        );
    } catch (e) {
        console.warn("Erro ao carregar gráficos do resumo", e);
    }
}


// ==============================
// ATUALIZAÇÃO CONJUNTA DO PAINEL
// ==============================
async function atualizarPainelRetencao() {
    await carregarInteligenciaIA();
}

// ==============================
// INICIALIZAÇÃO DE FILTROS DE PERÍODO (ANOS E MESES)
// ==============================
function inicializarFiltrosPeriodo() {
    const filtroAno = document.getElementById('filtroAnoCustom');
    const filtroMesInicial = document.getElementById('filtroMesInicialCustom');
    const filtroMesFinal = document.getElementById('filtroMesFinalCustom');
    const currentYear = new Date().getFullYear();
    const meses = [
        { value: '01', text: 'Jan' }, { value: '02', text: 'Fev' }, { value: '03', text: 'Mar' },
        { value: '04', text: 'Abr' }, { value: '05', text: 'Mai' }, { value: '06', text: 'Jun' },
        { value: '07', text: 'Jul' }, { value: '08', text: 'Ago' }, { value: '09', text: 'Set' },
        { value: '10', text: 'Out' }, { value: '11', text: 'Nov' }, { value: '12', text: 'Dez' }
    ];

    // Preencher anos (ex: 5 anos para trás e 5 para frente)
    if (filtroAno) {
        filtroAno.innerHTML = ''; // Limpa opções existentes
        for (let i = currentYear - 5; i <= currentYear + 5; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            filtroAno.appendChild(option);
        }
        filtroAno.value = currentYear; // Seleciona o ano atual por padrão
    }

    // Preencher meses
    [filtroMesInicial, filtroMesFinal].forEach(selectElement => {
        if (selectElement) {
            selectElement.innerHTML = ''; // Limpa opções existentes
            meses.forEach(mes => {
                const option = document.createElement('option');
                option.value = mes.value;
                option.textContent = mes.text;
                selectElement.appendChild(option);
            });
        }
    });
    if (filtroMesInicial) filtroMesInicial.value = '01'; // Janeiro por padrão
    if (filtroMesFinal) filtroMesFinal.value = '12';   // Dezembro por padrão
}

// ==============================
// FILTROS PERSONALIZADOS
// ==============================
function getNomeMes(numeroMes) {
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return meses[parseInt(numeroMes) - 1];
}

function aplicarFiltrosCustom() {
    const ano = document.getElementById('filtroAnoCustom').value;
    const mesInic = document.getElementById('filtroMesInicialCustom').value;
    const mesFim = document.getElementById('filtroMesFinalCustom').value;

    document.getElementById('inicioPeriodo').value = `${ano}-${mesInic}`;
    document.getElementById('fimPeriodo').value = `${ano}-${mesFim}`;

    const textoExibicao = document.getElementById('textoExibicaoFiltro');
    if (textoExibicao) {
        textoExibicao.innerHTML = `Exibindo dados de: <span class="font-semibold text-gray-800">${getNomeMes(mesInic)} de ${ano} a ${getNomeMes(mesFim)} de ${ano}</span>`;
    }

    atualizarPainelRetencao();
}

function limparFiltrosCustom() {
    document.getElementById('inicioPeriodo').value = '';
    document.getElementById('fimPeriodo').value = '';

    // Resetar valores dos selects para padrão
    document.getElementById('filtroAnoCustom').value = new Date().getFullYear().toString();
    document.getElementById('filtroMesInicialCustom').value = '01';
    document.getElementById('filtroMesFinalCustom').value = '12';

    const textoExibicao = document.getElementById('textoExibicaoFiltro');
    if (textoExibicao) {
        textoExibicao.innerHTML = `Exibindo dados de: <span class="font-semibold text-gray-800">Todo o período</span>`;
    }

    atualizarPainelRetencao();
}

// ==============================
// INTELIGÊNCIA IA (NOVO MÓDULO)
// ==============================
function renderizarEstadoIA(d) {
    const accValue = document.getElementById("ai-accuracy-value") || document.getElementById("metric-accuracy");
    const precValue = document.getElementById("metric-precision");
    const recValue = document.getElementById("metric-recall");
    const f1Value = document.getElementById("metric-f1");
    const statusMsg = document.getElementById("metric-status");

    if (!d || !d.treinado) {
        if (accValue) accValue.innerText = "0%";
        if (precValue) precValue.innerText = "0%";
        if (recValue) recValue.innerText = "0%";
        if (f1Value) f1Value.innerText = "0%";
        if (statusMsg) {
            statusMsg.innerText = d?.mensagem || "Modelo não treinado";
            statusMsg.style.color = "var(--warning)";
        }
        return;
    }

    const acuracia = (d.acuracia * 100).toFixed(1);
    if (accValue) accValue.innerText = `${acuracia}%`;
    if (precValue) precValue.innerText = `${(d.precision * 100).toFixed(1)}%`;
    if (recValue) recValue.innerText = `${(d.recall * 100).toFixed(1)}%`;
    if (f1Value) f1Value.innerText = `${(d.f1_score * 100).toFixed(1)}%`;

    if (statusMsg) {
        statusMsg.innerText = d.mensagem || "Modelo Operacional";
        statusMsg.style.color = "var(--secondary)";
    }
}

async function atualizarEstadoIA() {
    try {
        const resp = await fetch(`${API}/modelo_status?t=${Date.now()}`);
        if (!resp.ok) {
            renderizarEstadoIA(null);
            return;
        }
        const d = await resp.json();
        renderizarEstadoIA(d);
    } catch (e) {
        console.warn("Erro ao carregar status da IA", e);
        renderizarEstadoIA(null);
    }
}

async function carregarInteligenciaIA() {
    try {
        const inicio = document.getElementById("inicioPeriodo")?.value || "";
        const fim = document.getElementById("fimPeriodo")?.value || "";
        const params = new URLSearchParams();
        if (inicio) params.append("inicio", inicio);
        if (fim) params.append("fim", fim);

        const resp = await fetch(`${API}/inteligencia_ia?${params.toString()}&t=${Date.now()}`);
        if (!resp.ok) {
            console.error("Erro na API (IA). Status:", resp.status);
            return;
        }
        const d = await resp.json();

        // 1. Matriz de Intensidade Mensal
        const tbody = document.getElementById("tabelaMatriz");
        if (tbody && d.matriz) {
            tbody.innerHTML = d.matriz.map(ano => {
                const totalAno = ano.meses.reduce((soma, mes) => soma + mes.valor, 0);
                return `
                    <tr>
                        <td><strong>${ano.ano}</strong></td>
                        ${ano.meses.map(m => `<td class="${m.heat}">${m.valor}</td>`).join("")}
                        <td style="background-color: rgba(255, 255, 255, 0.1); color: var(--text-main);"><strong>${totalAno}</strong></td>
                    </tr>
                `;
            }).join("");
        }

        // 2. Gráficos Inteligentes
        if (d.projecao) renderizarGraficoProjecao(d.projecao.labels, d.projecao.historico, d.projecao.ia);
        if (d.motivos) renderizarGraficoMotivos(d.motivos.labels, d.motivos.valores);
        if (d.fatores_alto_risco) renderizarGraficoFatoresAlto(d.labels_fatores, d.fatores_alto_risco);
        if (d.fatores_medio_risco) renderizarGraficoFatoresMedio(d.labels_fatores, d.fatores_medio_risco);
        if (d.fatores_baixo_risco) renderizarGraficoFatoresBaixo(d.labels_fatores_positivos || d.labels_fatores, d.fatores_baixo_risco);

        // 3. NPS
        const gaugeNps = document.getElementById("gaugeNPS");
        const scoreNps = document.getElementById("npsScore");
        if (gaugeNps && d.nps !== undefined) gaugeNps.style.setProperty("--value", d.nps);
        if (scoreNps && d.nps !== undefined) scoreNps.innerText = d.nps;

    } catch (e) {
        console.warn("Erro ao carregar dados de IA", e);
    }
}

// ==============================
// GRÁFICOS
// ==============================
function renderizarGraficoDistribuicaoRisco(labels, valores) {
    const ctx = obterContextoCanvas("graficoDistribuicaoRisco");
    if (!ctx) return;

    destruirGrafico("distribuicaoRisco");

    graficos.distribuicaoRisco = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: ["#ef4444", "#f59e0b", "#10b981"],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom" }
            }
        }
    });
}

function renderizarGraficoCurso(labels, valores) {
    const ctx = obterContextoCanvas("graficoCurso");
    if (!ctx) return;

    destruirGrafico("curso");

    const labelsFormatados = labels.map(l => {
        if (l === "ede de Computadores" || l === "Rede de Computadores" || l === "Redes de Computadores") return "Redes";
        return l;
    });

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#00f2ff');
    gradient.addColorStop(1, '#9d50bb');

    graficos.curso = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labelsFormatados,
            datasets: [{
                label: "Dados Confirmados",
                data: valores,
                backgroundColor: gradient,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Evasão por Curso',
                    font: { size: 14, weight: 'bold' },
                    color: '#ffffff'
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 10 } } }
            }
        }
    });
}

function renderizarGraficoFaixaEtaria(labels, valores) {
    const ctx = obterContextoCanvas("graficoFaixaEtaria");
    if (!ctx) return;

    destruirGrafico("faixaEtaria");

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#00f2ff');
    gradient.addColorStop(1, '#9d50bb');

    graficos.faixaEtaria = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Dados Confirmados",
                data: valores,
                backgroundColor: gradient,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Evasão por Idade',
                    font: { size: 14, weight: 'bold' },
                    color: '#ffffff'
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { autoSkip: false, font: { size: 11 } } }
            }
        }
    });
}

function renderizarGraficoFatoresRisco(labels, valores, total_risco) {
    const ctx = obterContextoCanvas("graficoFatoresRisco");
    if (!ctx) return;

    destruirGrafico("fatoresRisco");

    graficos.fatoresRisco = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Total em Risco",
                data: valores,
                backgroundColor: [
                    "#3b82f6", // Azul
                    "#10b981", // Verde
                    "#f59e0b", // Laranja
                    "#8b5cf6", // Roxo
                    "#ef4444"  // Vermelho
                ],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: false,
                    text: 'Total em Risco',
                    font: { size: 14, weight: 'bold' },
                    color: '#ffffff'
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, suggestedMax: total_risco ? total_risco * 1.1 : undefined },
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 10 } } }
            }
        },
        plugins: [{
            id: 'numerosNasBarrasRisco',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#ffffff';

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar, index) => {
                        const valor = dataset.data[index];
                        if (valor > 0) {
                            ctx.fillText(valor, bar.x, bar.y - 4);
                        }
                    });
                });
                ctx.restore();
            }
        }]
    });
}

function renderizarGraficoGenero(labels, valores, totais) {
    const ctx = obterContextoCanvas("graficoGenero");
    if (!ctx) return;

    destruirGrafico("genero");

    // Se não tiver os totais por algum motivo, usa os próprios valores (fallback)
    const dadosTotais = totais && totais.length ? totais : valores;

    // Mapeamento seguro dos índices para as barras
    const idxMasc = labels.indexOf("Masculino") !== -1 ? labels.indexOf("Masculino") : 0;
    const idxFem = labels.indexOf("Feminino") !== -1 ? labels.indexOf("Feminino") : 1;

    const totalMasc = dadosTotais[idxMasc] || 0;
    const riscoMasc = valores[idxMasc] || 0;

    const totalFem = dadosTotais[idxFem] || 0;
    const riscoFem = valores[idxFem] || 0;

    graficos.genero = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Masculino", "Feminino"],
            datasets: [
                {
                    label: "Total Matriculados",
                    data: [totalMasc, totalFem],
                    backgroundColor: ["#93c5fd", "#fbcfe8"], // Azul e Rosa (Claros para Total)
                    borderRadius: 6
                },
                {
                    label: "Em Risco",
                    data: [riscoMasc, riscoFem],
                    backgroundColor: ["#2563eb", "#ec4899"], // Azul e Rosa (Escuros para Risco)
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 15 } }, // Dá espaço para o número não cortar no topo
            plugins: {
                legend: { position: "bottom" },
                title: {
                    display: true,
                    text: 'Evasão por Gênero',
                    font: { size: 14, weight: 'bold' },
                    color: '#ffffff'
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { autoSkip: false, font: { size: 11 } } }
            }
        },
        plugins: [{
            id: 'numerosNasBarras',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#ffffff'; // Cor do texto

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar, index) => {
                        const valor = dataset.data[index];
                        if (valor > 0) {
                            ctx.fillText(valor, bar.x, bar.y - 4);
                        }
                    });
                });
                ctx.restore();
            }
        }]
    });
}

function renderizarGraficoSemestre(labels, valores) {
    const ctx = obterContextoCanvas("graficoSemestre");
    if (!ctx) return;

    destruirGrafico("semestre");

    const mapaNomes = {
        "Q1": "Jan - Mar", "Q2": "Abr - Jun", "Q3": "Jul - Set", "Q4": "Out - Dez",
        "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun",
        "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez"
    };

    const labelsFormatados = labels.map(l => {
        const chave = String(l).padStart(2, '0');
        return mapaNomes[l] || mapaNomes[chave] || l;
    });

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#00f2ff');
    gradient.addColorStop(1, '#9d50bb');

    graficos.semestre = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labelsFormatados,
            datasets: [{
                label: "Dados Confirmados",
                data: valores,
                backgroundColor: gradient,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Evasão por Semestre',
                    font: { size: 14, weight: 'bold' },
                    color: '#ffffff'
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 10 } } }
            }
        }
    });
}


function renderizarGraficoProjecao(labels, historico, ia) {
    const ctx = obterContextoCanvas("graficoProjecao");
    if (!ctx) return;
    destruirGrafico("projecao");

    // Mapeamento de períodos técnicos e meses para nomes amigáveis
    const mapaNomes = {
        "Q1": "Jan - Mar",
        "Q2": "Abr - Jun",
        "Q3": "Jul - Set",
        "Q4": "Out - Dez",
        "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
        "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
        "09": "Set", "10": "Out", "11": "Nov", "12": "Dez"
    };

    const labelsFormatados = labels.map(l => {
        const base = String(l).replace("(Proj)", "");
        const chave = base.padStart(2, '0');
        const nome = mapaNomes[base] || mapaNomes[chave] || base;
        return String(l).includes("(Proj)") ? `${nome} (Proj)` : nome;
    });

    graficos.projecao = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labelsFormatados,
            datasets: [
                {
                    label: "Dados Confirmados",
                    data: historico,
                    backgroundColor: "#3b82f6",
                    stack: 'Stack 0',
                },
                {
                    label: "Tendência Estimada pela IA",
                    data: ia,
                    backgroundColor: "rgba(59, 130, 246, 0.25)",
                    borderColor: "#3b82f6",
                    borderWidth: 2,
                    borderDash: [5, 5],
                    stack: 'Stack 0',
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            }
        }
    });
}

function renderizarGraficoMotivos(labels, valores) {
    const ctx = obterContextoCanvas("graficoMotivos");
    if (!ctx) return;
    destruirGrafico("motivos");

    graficos.motivos = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: ["#ef4444", "#f59e0b", "#00f2ff", "#10b981", "#9d50bb"]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    align: 'start', // Alinha os itens da legenda à esquerda
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}


function renderizarGraficoFatoresAlto(labels, valores) {
    const ctx = obterContextoCanvas("graficoFatoresAltoRisco");
    if (!ctx) return;
    destruirGrafico("fatoresAltoRisco");

    graficos.fatoresAltoRisco = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels.map(l => l.replace("Frequência", "Freq.")),
            datasets: [{
                label: "Alto Risco",
                data: valores,
                backgroundColor: "#ef4444",
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, suggestedMax: 5 },
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 9 } } }
            }
        },
        plugins: [{
            id: 'numerosNasBarrasAltoRisco',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#ffffff';

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar, index) => {
                        const valor = dataset.data[index];
                        if (valor > 0) {
                            ctx.fillText(valor, bar.x, bar.y - 2);
                        }
                    });
                });
                ctx.restore();
            }
        }]
    });
}

function renderizarGraficoFatoresMedio(labels, valores) {
    const ctx = obterContextoCanvas("graficoFatoresMedioRisco");
    if (!ctx) return;
    destruirGrafico("fatoresMedioRisco");

    graficos.fatoresMedioRisco = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels.map(l => l.replace("Frequência", "Freq.")),
            datasets: [{
                label: "Médio Risco",
                data: valores,
                backgroundColor: "#f59e0b",
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 9 } } }
            }
        },
        plugins: [{
            id: 'numerosNasBarrasMedioRisco',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#ffffff';

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar, index) => {
                        const valor = dataset.data[index];
                        if (valor > 0) {
                            ctx.fillText(valor, bar.x, bar.y - 2);
                        }
                    });
                });
                ctx.restore();
            }
        }]
    });
}

function renderizarGraficoFatoresBaixo(labels, valores) {
    const ctx = obterContextoCanvas("graficoFatoresBaixoRisco");
    if (!ctx) return;
    destruirGrafico("fatoresBaixoRisco");

    graficos.fatoresBaixoRisco = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels.map(l => l.replace("Frequência", "Freq.")),
            datasets: [{
                label: "Baixo Risco",
                data: valores,
                backgroundColor: "#10b981", // Verde para Baixo Risco
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 9 } } }
            }
        },
        plugins: [{
            id: 'numerosNasBarrasBaixoRisco',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#ffffff';

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar, index) => {
                        const valor = dataset.data[index];
                        if (valor > 0) {
                            ctx.fillText(valor, bar.x, bar.y - 2);
                        }
                    });
                });
                ctx.restore();
            }
        }]
    });
}

// ==============================
// ANÁLISE
// ==============================
async function executarAnalise() {
    if (!validarCampos()) return;

    const dados = coletarDados();

    try {
        const res = await fetch(`${API}/prever_novo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados)
        });

        const json = await res.json();
        const area = document.getElementById("resultadoArea");

        if (!area) return;

        if (!res.ok) {
            mostrarMensagemCadastro(json.erro || "Erro ao processar análise.", "erro");
            return;
        }

        area.style.display = "block";
        area.innerHTML = `
            <div><strong>${json.mensagem || "Resultado da análise"}</strong></div>
            <div style="margin-top:6px;">Nível de risco: <strong>${json.nivel_risco || "-"}</strong></div>
            <div>Probabilidade: <strong>${json.probabilidade || 0}%</strong></div>
            <div style="margin-top:6px;">Recomendações: ${json.recomendacoes || "Sem recomendações."}</div>
        `;

        area.className = "";
        area.style.background = "";
        area.style.color = "";
        area.style.border = "";
        
        if (json.nivel_risco === "ALTO") {
            area.classList.add("status-risco");
        } else if (json.nivel_risco === "MEDIO") {
            area.classList.add("status-medio");
        } else if (json.nivel_risco === "BAIXO") {
            area.classList.add("status-seguro");
        } else {
            area.style.background = "#f1f5f9";
            area.style.color = "#334155";
            area.style.border = "1px solid #cbd5e1";
        }
    } catch (e) {
        mostrarMensagemCadastro("Erro ao processar análise.", "erro");
        console.error(e);
    }
}

// ==============================
// SALVAR / ATUALIZAR
// ==============================
async function salvarAluno() {
    if (!validarCampos()) return;

    const dados = coletarDados();
    const alunoId = obterAlunoEditandoId();
    const editando = alunoId !== "";

    try {
        const url = editando ? `${API}/atualizar/${alunoId}` : `${API}/cadastrar`;
        const metodo = editando ? "PUT" : "POST";

        const res = await fetch(url, {
            method: metodo,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados)
        });

        const json = await res.json();

        if (!res.ok) {
            mostrarMensagemCadastro(
                json.erro || (editando ? "Erro ao atualizar aluno." : "Erro ao salvar aluno."),
                "erro"
            );
            return;
        }

        // Limpa automaticamente os campos e reseta o estado do formulário após sucesso
        limparCampos();

        mostrarMensagemCadastro(
            json.mensagem || (editando ? "Aluno atualizado com sucesso!" : "Aluno cadastrado com sucesso!"),
            "sucesso"
        );
        await carregarDashboardCompleto({ silentMode: true });

        if (consultaRealizada) {
            await carregarAlunos(paginaAtual);
        } else {
            limparTabela();
        }
    } catch (e) {
        mostrarMensagemCadastro(
            editando ? "Erro ao atualizar no servidor." : "Erro ao salvar no servidor.",
            "erro"
        );
        console.error(e);
    }
}

async function editarAluno(id) {
    try {
        const res = await fetch(`${API}/aluno/${id}`);
        const json = await res.json();

        if (!res.ok) {
            mostrarMensagemCadastro(json.erro || "Erro ao carregar aluno.", "erro");
            return;
        }

        preencherFormulario(json);
        mostrarMensagemCadastro("Aluno carregado para edição.", "info");
    } catch (e) {
        mostrarMensagemCadastro("Erro ao carregar aluno para edição.", "erro");
        console.error(e);
    }
}

async function excluirAluno(id) {
    const confirmar = confirm("Tem certeza que deseja excluir este aluno?");
    if (!confirmar) return;

    try {
        const res = await fetch(`${API}/deletar/${id}`, { method: "DELETE" });
        const json = await res.json();

        if (!res.ok) {
            mostrarMensagemCadastro(json.erro || "Erro ao excluir aluno.", "erro");
            return;
        }

        const editandoId = document.getElementById("alunoEditandoId")?.value;
        if (String(editandoId) === String(id)) {
            limparCampos();
        }

        mostrarMensagemCadastro(json.mensagem || "Aluno removido com sucesso.", "sucesso");

        await carregarDashboardCompleto({ silentMode: true });

        if (consultaRealizada) {
            await carregarAlunos(paginaAtual);
        } else {
            limparTabela();
        }
    } catch (e) {
        mostrarMensagemCadastro("Erro ao excluir aluno.", "erro");
        console.error(e);
    }
}

async function excluirAlunoAtual() {
    const alunoId = document.getElementById("alunoEditandoId")?.value;

    if (!alunoId) {
        mostrarMensagemCadastro("Selecione um aluno para excluir primeiro.", "erro");
        return;
    }

    await excluirAluno(alunoId);
}

// ==============================
// UPLOAD
// ==============================
let uploadXHR = null;
let progressInterval = null;

async function uploadBase() {
    const input = document.getElementById("arquivoCSV");
    const progressContainer = document.getElementById("uploadProgressContainer");
    const uploadBar = document.getElementById("uploadProgressBar");
    const uploadPercent = document.getElementById("uploadPercent");
    const statusLabel = document.getElementById("uploadStatusText");

    if (!input || !input.files.length) {
        mostrarMensagemUpload("Selecione um arquivo CSV.", "erro");
        return;
    }

    if (uploadXHR || progressInterval) {
        mostrarMensagemUpload("Um upload já está em andamento.", "erro");
        return;
    }

    const formData = new FormData();
    formData.append("arquivo", input.files[0]);

    // Altera para estado ativo
    if (uploadBar) {
        uploadBar.style.width = "0%";
        uploadBar.style.backgroundColor = "hsl(0, 84%, 60%)"; // Vermelho inicial
    }
    if (uploadPercent) uploadPercent.innerText = "0%";
    if (statusLabel) {
        statusLabel.innerText = "Carregando base de dados";
        statusLabel.style.color = "#ef4444"; // Vermelho inicial
    }

    const xhr = new XMLHttpRequest();
    uploadXHR = xhr;

    // Animação simulada, pois arquivos locais sobem tão rápido que a cor não tem tempo de transicionar
    let simulatedPercent = 0;
    progressInterval = setInterval(() => {
        if (simulatedPercent < 100) {
            simulatedPercent += 20;
            if (simulatedPercent >= 100) {
                simulatedPercent = 100;
                clearInterval(progressInterval);
                if (statusLabel) {
                    statusLabel.innerText = "Processando...";
                    statusLabel.style.color = "#10b981"; // Verde
                }
            }
            
            if (uploadBar) {
                uploadBar.style.width = `${simulatedPercent}%`;
                // Transição de Hue: 0 (Vermelho) -> ~30 (Laranja) -> ~60 (Amarelo) -> 160 (Verde)
                const currentHue = Math.round((simulatedPercent / 100) * 160);
                const currentLightness = Math.round(60 - (21 * (simulatedPercent / 100)));
                uploadBar.style.backgroundColor = `hsl(${currentHue}, 84%, ${currentLightness}%)`;
            }
            if (uploadPercent) uploadPercent.innerText = `${simulatedPercent}%`;
        }
    }, 400); // 400ms casa perfeitamente com o tempo de transition do CSS

    xhr.onload = async () => {
        clearInterval(progressInterval);
        progressInterval = null;
        uploadXHR = null;
        if (xhr.status >= 200 && xhr.status < 300) {
            const json = JSON.parse(xhr.responseText);
            mostrarMensagemUpload(json.mensagem || "Base enviada com sucesso!", "sucesso");
            
            // Sucesso: Mantém a barra verde em 100% e atualiza o texto
            if (uploadBar) {
                uploadBar.style.width = "100%";
                uploadBar.style.backgroundColor = "#10b981"; // Verde
            }
            if (uploadPercent) uploadPercent.innerText = "100%";
            if (statusLabel) {
                statusLabel.innerText = "Base Substituída";
                statusLabel.style.color = "#10b981";
            }

            input.value = "";
            const fileNameEl = document.getElementById('file-name');
            const statusTextEl = document.getElementById('status-text');
            if (fileNameEl) fileNameEl.textContent = "UPLOAD CSV";
            if (statusTextEl) statusTextEl.textContent = "";
            
            // Força o recarregamento completo dos dados via API garantindo interface atualizada
            await carregarDashboardCompleto({ isFromUpload: true });

            consultaRealizada = false;
            limparTabela();
            limparCampos();
        } else {
            // Em caso de erro, retorna para o estado neutro (cinza)
            if (uploadBar) {
                uploadBar.style.width = "0%";
                uploadBar.style.backgroundColor = "#ef4444"; // Vermelho no erro
                setTimeout(() => { if (uploadBar) uploadBar.style.backgroundColor = "#94a3b8"; }, 2000);
            }
            if (uploadPercent) uploadPercent.innerText = "0%";
            if (statusLabel) {
                statusLabel.innerText = "Carregar Base";
                statusLabel.style.color = "#64748b";
            }

            let erroMsg = "Erro ao enviar a base.";
            try { erroMsg = JSON.parse(xhr.responseText).erro || erroMsg; } catch(e){}
            mostrarMensagemUpload(erroMsg, "erro");
        }
    };

    xhr.onerror = () => {
        clearInterval(progressInterval);
        progressInterval = null;
        uploadXHR = null;
        if (uploadBar) {
            uploadBar.style.width = "0%";
            uploadBar.style.backgroundColor = "#ef4444";
        }
        if (statusLabel) {
            statusLabel.innerText = "Erro na Conexão";
            statusLabel.style.color = "#ef4444";
        }
        mostrarMensagemUpload("Erro na conexão com o servidor.", "erro");
    };

    xhr.onabort = () => {
        clearInterval(progressInterval);
        progressInterval = null;
        uploadXHR = null;
    };

    xhr.open("POST", `${API}/upload_base`, true);
    xhr.send(formData);
}

function cancelarUpload() {
    if (!uploadXHR && !progressInterval) {
        return;
    }

    if (uploadXHR) {
        uploadXHR.abort();
        uploadXHR = null;
    }
    
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }

    const uploadBar = document.getElementById("uploadProgressBar");
    const uploadPercent = document.getElementById("uploadPercent");
    const statusLabel = document.getElementById("uploadStatusText");
    const input = document.getElementById("arquivoCSV");

    if (uploadBar) {
        uploadBar.style.width = "0%";
        uploadBar.style.backgroundColor = "#94a3b8";
    }
    if (uploadPercent) uploadPercent.innerText = "0%";
    if (statusLabel) {
        statusLabel.innerText = "Carregar Base";
        statusLabel.style.color = "#64748b";
    }

    if (input) input.value = "";
    const fileNameEl = document.getElementById('file-name');
    const statusTextEl = document.getElementById('status-text');
    if (fileNameEl) fileNameEl.textContent = "UPLOAD CSV";
    if (statusTextEl) statusTextEl.textContent = "";

    mostrarMensagemUpload("Upload cancelado.", "erro");
}

async function baixarBase() {
    try {
        const response = await fetch(`${API}/baixar_base`);
        if (!response.ok) {
            let data = {};
            try { data = await response.json(); } catch (e) {}
            mostrarMensagemUpload(data.erro || "Erro ao baixar base. Verifique se a base não está vazia.", "erro");
            return;
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "base_estudantes.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (e) {
        mostrarMensagemUpload("Erro na conexão com o servidor.", "erro");
    }
}

// ==============================
// TABELA
// ==============================
async function carregarAlunos(pagina = 1) {
    try {
        consultaRealizada = true;
        const filtros = obterFiltrosConsulta();
        const params = new URLSearchParams();
        if (filtros.nome) params.append("nome", filtros.nome);
        if (filtros.matricula) params.append("matricula", filtros.matricula);
        if (filtros.turma) params.append("turma", filtros.turma);
        if (filtros.curso) params.append("curso", filtros.curso);
        if (filtros.nivel_risco) params.append("nivel_risco", filtros.nivel_risco);
        
        params.append("pagina", pagina);

        const res = await fetch(`${API}/alunos?${params.toString()}`);
        const data = await res.json();

        paginaAtual = data.pagina_atual;
        renderizarTabela(data.alunos);
        renderizarPaginacao(data.paginas, data.pagina_atual);
    } catch (e) {
        console.error("Erro ao carregar alunos", e);
        mostrarMensagem("Erro ao carregar alunos.", "erro");
    }
}

async function carregarAlunosRisco() {
    try {
        const res = await fetch(`${API}/alunos_risco`);
        const alunos = await res.json();
        renderizarTabela(alunos);
    } catch (e) {
        console.error("Erro ao carregar alunos em risco", e);
        mostrarMensagem("Erro ao carregar alunos em risco.", "erro");
    }
}

function renderizarPaginacao(totalPaginas, atual) {
    const container = document.getElementById("paginacaoTabela");
    if (!container) return;
    
    let html = `<span>Página ${atual} de ${totalPaginas}</span><div style="display:flex; gap:5px;">`;
    
    if (atual > 1) {
        html += `<button class="btn-primary" style="width:auto; padding:5px 10px;" onclick="carregarAlunos(${atual - 1})">Anterior</button>`;
    }
    
    if (atual < totalPaginas) {
        html += `<button class="btn-primary" style="width:auto; padding:5px 10px;" onclick="carregarAlunos(${atual + 1})">Próxima</button>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

function renderizarTabela(alunos) {
    const tbody = document.getElementById("tabelaAlunos");
    if (!tbody) return;

    if (!alunos || !alunos.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty">Nenhum aluno encontrado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = alunos.map(aluno => `
        <tr>
            <td>${aluno.Matricula ?? ""}</td>
            <td>${aluno.Nome ?? ""}</td>
            <td>${aluno.Turma ?? ""}</td>
            <td>${aluno.Curso ?? ""}</td>
            <td>${aluno.Semestre ?? ""}</td>
            <td>${aluno.Age ?? ""}</td>
            <td>${aluno.GPA ?? 0}</td>
            <td>${aluno.Attendance_Rate ?? 0}%</td>
            <td>${badgeNivel(aluno.Nivel_Risco || "BAIXO")}</td>
            <td>
                <div style="display: flex; gap: 4px;">
                    <button style="background: none; border: none; width: auto; padding: 0; font-size: 1.2rem; cursor: pointer;" onclick="editarAluno(${aluno.ID})" title="Editar">✏️</button>
                    <button style="background: none; border: none; width: auto; padding: 0; font-size: 1.2rem; cursor: pointer;" onclick="excluirAluno(${aluno.ID})" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>
    `).join("");
}

function limparTabela() {
    const tbody = document.getElementById("tabelaAlunos");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="10" class="empty">Faça uma consulta para exibir os alunos.</td>
        </tr>
    `;
}

function renderizarMensagemConsulta() {
    const tbody = document.getElementById("tabelaAlunos");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="10" class="empty">Preencha pelo menos um filtro para consultar.</td>
        </tr>
    `;
}

function limparFiltros() {
    ["filtroNome", "filtroMatricula", "filtroTurma", "filtroCurso"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const nivel = document.getElementById("filtroNivelRisco");
    if (nivel) nivel.value = "";

    consultaRealizada = false;
    limparTabela();
}

// ==============================
// RESETAR
// ==============================
function confirmarReset() {
    const total = parseInt(document.getElementById("totalAlunos")?.innerText || "0", 10);
    if (total === 0) {
        mostrarMensagemUpload("A base já está vazia. Faça o upload de um arquivo.", "erro");
        return;
    }

    const modal = document.getElementById('resetModal');
    if (modal) modal.style.display = 'flex';
}

function fecharModalReset() {
    const modal = document.getElementById('resetModal');
    if (modal) modal.style.display = 'none';
}

async function resetarBase() {
    fecharModalReset();
    try {
        // Reset visual imediato
        const uploadBar = document.getElementById("uploadProgressBar");
        const statusLabel = document.getElementById("uploadStatusText");
        const uploadPercent = document.getElementById("uploadPercent");
        const arquivoInput = document.getElementById("arquivoCSV");

        if (uploadBar) {
            uploadBar.style.width = "0%";
            uploadBar.style.backgroundColor = "#94a3b8";
        }
        if (statusLabel) {
            statusLabel.innerText = "Carregar Base";
            statusLabel.style.color = "#64748b";
        }
        if (uploadPercent) uploadPercent.innerText = "0%";
        if (arquivoInput) arquivoInput.value = ""; // Limpa o seletor de arquivo para evitar confusão
        const fileNameEl = document.getElementById('file-name');
        const statusTextEl = document.getElementById('status-text');
        if (fileNameEl) fileNameEl.textContent = "UPLOAD CSV";
        if (statusTextEl) statusTextEl.textContent = "";

        const res = await fetch(`${API}/resetar_base`, { method: "DELETE" });
        const json = await res.json();

        if (!res.ok) {
            mostrarMensagemUpload(json.erro || "Erro ao resetar base.", "erro");
            await carregarDashboardCompleto({ silentMode: true }); // Restaura o estado real caso o reset falhe
            return;
        }

        mostrarMensagemUpload("Base resetada com sucesso.", "sucesso");

        await carregarDashboardCompleto({ isFromUpload: true });
        consultaRealizada = false;
        limparTabela();
        limparCampos();
    } catch (e) {
        mostrarMensagemUpload("Erro ao resetar base.", "erro");
        console.error(e);
    }
}

// ==============================
// MODAL DE DETALHES
// ==============================
async function verDetalhesAluno(id) {
    try {
        const res = await fetch(`${API}/aluno/${id}`);
        const aluno = await res.json();

        if (!res.ok) {
            mostrarMensagem(aluno.erro || "Erro ao carregar aluno.", "erro");
            return;
        }

        const modal = document.getElementById("modalDetalhes");
        const conteudo = document.getElementById("conteudoModalDetalhes");
        
        if (!modal || !conteudo) return;

        const nivelClass = aluno.Nivel_Risco === 'ALTO' ? 'status-risco' : (aluno.Nivel_Risco === 'MEDIO' ? 'status-medio' : 'status-seguro');

        conteudo.innerHTML = `
            <div class="detalhes-grid">
                <div class="detalhe-item">
                    <div class="detalhe-label">Nome</div>
                    <div class="detalhe-valor">${aluno.Nome || "-"}</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Matrícula</div>
                    <div class="detalhe-valor">${aluno.Matricula || "-"}</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Curso / Semestre</div>
                    <div class="detalhe-valor">${aluno.Curso || "-"} (${aluno.Semestre || "-"})</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Idade / Gênero</div>
                    <div class="detalhe-valor">${aluno.Age || "-"} anos / ${String(aluno.Gender_Male) === '1' ? 'Masculino' : 'Feminino'}</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Méd. de notas-GPA</div>
                    <div class="detalhe-valor">${aluno.GPA || "-"}</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Frequência</div>
                    <div class="detalhe-valor">${aluno.Attendance_Rate || "-"}%</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Horas de Estudo (dia)</div>
                    <div class="detalhe-valor">${aluno.Study_Hours_per_Day || "-"}h</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Tempo de Deslocamento</div>
                    <div class="detalhe-valor">${aluno.Travel_Time_Minutes || "-"} min</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Índice de Estresse</div>
                    <div class="detalhe-valor">${aluno.Stress_Index || "-"} / 10</div>
                </div>
                <div class="detalhe-item">
                    <div class="detalhe-label">Data de Referência</div>
                    <div class="detalhe-valor">${aluno.Data_Referencia ? aluno.Data_Referencia.split('-').reverse().join('/') : "-"}</div>
                </div>
                
                <div class="detalhe-item full ${nivelClass}" style="margin-top: 10px;">
                    <div class="detalhe-label" style="color: inherit; opacity: 0.8;">Nível de Risco IA</div>
                    <div class="detalhe-valor" style="font-size: 1.1rem; display: flex; justify-content: space-between;">
                        <span>${aluno.Nivel_Risco || "Não Analisado"}</span>
                        <span>${aluno.Probabilidade_Risco || 0}% de Probabilidade</span>
                    </div>
                </div>
                <div class="detalhe-item full" style="background: #eff6ff; border-color: #bfdbfe;">
                    <div class="detalhe-label" style="color: #1e3a8a;">Recomendações da IA</div>
                    <div class="detalhe-valor" style="color: #1e3a8a; font-weight: normal;">
                        ${aluno.Recomendacoes ? aluno.Recomendacoes.split(' | ').map(r => `• ${r}`).join('<br>') : "Nenhuma recomendação disponível."}
                    </div>
                </div>
            </div>
        `;

        modal.style.display = "flex";
    } catch (e) {
        mostrarMensagem("Erro ao carregar detalhes do aluno.", "erro");
        console.error(e);
    }
}

function fecharModalDetalhes() {
    const modal = document.getElementById("modalDetalhes");
    if (modal) modal.style.display = "none";
}

document.addEventListener("click", function(event) {
    const modal = document.getElementById("modalDetalhes");
    const resetModal = document.getElementById("resetModal");
    if (event.target === modal) {
        fecharModalDetalhes();
    }
    if (event.target === resetModal) {
        fecharModalReset();
    }
});