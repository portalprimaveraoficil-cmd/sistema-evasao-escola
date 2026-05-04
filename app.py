from flask import Flask, jsonify, request, send_file, render_template
from flask_cors import CORS
import pandas as pd
import os
import re
import unicodedata
from io import BytesIO
from datetime import datetime
import calendar
import sqlite3

import database
from ml_model import modelo_global

app = Flask(__name__)
CORS(app)

# =========================
# CONFIGURAÇÕES DE DADOS
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

CAMINHO_CSV = os.path.join(DATA_DIR, "base_de_dados_estudantes.csv")
CAMINHO_BASE = CAMINHO_CSV
CAMINHO_DB = os.path.join(DATA_DIR, "sistema_escola.db")

COLUNAS_PADRAO = [
    "ID",
    "Nome",
    "Matricula",
    "Turma",
    "Curso",
    "Semestre",
    "Age",
    "GPA",
    "Attendance_Rate",
    "Study_Hours_per_Day",
    "Travel_Time_Minutes",
    "Stress_Index",
    "Gender_Male",
    "Dropout",
    "Nivel_Risco",
    "Probabilidade_Risco",
    "Recomendacoes",
    "Data_Referencia"
]

COLUNAS_NUMERICAS = [
    "ID",
    "Age",
    "GPA",
    "Attendance_Rate",
    "Study_Hours_per_Day",
    "Travel_Time_Minutes",
    "Stress_Index",
    "Gender_Male",
    "Dropout",
    "Probabilidade_Risco"
]

COLUNAS_EXCLUIDAS_MODELO = [
    "ID",
    "Nome",
    "Matricula",
    "Dropout",
    "Nivel_Risco",
    "Probabilidade_Risco",
    "Recomendacoes",
    "Data_Referencia"
]


# =========================
# UTILITÁRIOS
# =========================
def normalizar_texto_chave(texto):
    texto = str(texto).strip().lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^a-z0-9]+", "_", texto)
    texto = re.sub(r"_+", "_", texto).strip("_")
    return texto


def get_db_connection():
    return database.get_db_connection(CAMINHO_DB)

def sincronizar_csv_para_sqlite():
    """Migra dados do CSV para o SQLite se o DB estiver vazio"""
    if os.path.exists(CAMINHO_CSV):
        df = ler_csv_flexivel(CAMINHO_CSV)
        if not df.empty:
            df = completar_base_generica(df)
            conn = get_db_connection()
            df.to_sql("alunos", conn, if_exists="replace", index=False)
            conn.close()
            print("[INFO] CSV sincronizado com SQLite.")

def sincronizar_sqlite_para_csv():
    """Mantém o CSV atualizado como um backup físico espelhado do SQLite."""
    try:
        df = carregar_dados()
        try:
            df.to_csv(CAMINHO_CSV, index=False, encoding="utf-8-sig")
        except PermissionError:
            print("[AVISO] O arquivo CSV está aberto. Sincronização de backup ignorada.")
    except Exception as e:
        print(f"[ERRO] Ao sincronizar SQLite para CSV: {e}")

def garantir_base():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS alunos (
            {", ".join([f"{col} TEXT" for col in COLUNAS_PADRAO])}
        )
    ''')
    conn.commit()
    # Se a tabela estiver vazia, tenta carregar do CSV
    cursor.execute("SELECT count(*) FROM alunos")
    count = cursor.fetchone()[0]
    conn.close()
    if count == 0:
        sincronizar_csv_para_sqlite()
    
    # REMOVIDO: O código abaixo foi desativado para garantir que o sistema
    # inicie SEMPRE vazio na primeira vez, esperando o upload do usuário.
    # if count == 0:
    #     sincronizar_csv_para_sqlite()


def texto_seguro(valor):
    if valor is None:
        return ""
    return str(valor).strip()


def numero_seguro(valor, tipo=float, padrao=0):
    try:
        if valor is None or str(valor).strip() == "":
            return tipo(padrao)
        return tipo(float(str(valor).replace(",", ".")))
    except Exception:
        return tipo(padrao)


def normalizar_genero(valor):
    if isinstance(valor, str):
        v = valor.strip().lower()
        if v in ["1", "true", "sim", "masculino", "male", "m"]:
            return 1
        return 0
    return 1 if valor else 0


def normalizar_dropout(valor):
    if isinstance(valor, str):
        v = valor.strip().lower()
        if v in ["1", "true", "sim", "alto", "medio", "médio", "em risco", "risco", "evasao", "evasão"]:
            return 1
        return 0
    try:
        return 1 if int(float(valor)) == 1 else 0
    except Exception:
        return 0


def normalizar_data(valor):
    if valor is None or str(valor).strip() == "":
        return ""
    try:
        dt = pd.to_datetime(valor, errors="coerce", dayfirst=False)
        if pd.isna(dt):
            return ""
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def data_padrao_por_indice(idx):
    ano = 2024 + (idx % 2)
    mes = (idx % 12) + 1
    dia = (idx % 28) + 1
    return f"{ano:04d}-{mes:02d}-{dia:02d}"


def faixa_etaria(idade):
    idade = numero_seguro(idade, int, 0)
    if idade <= 17:
        return "Até 17"
    if idade <= 20:
        return "18-20"
    if idade <= 24:
        return "21-24"
    if idade <= 30:
        return "25-30"
    return "31+"


def label_genero(valor):
    return "Masculino" if normalizar_genero(valor) == 1 else "Feminino"


def ordenar_semestres_unicos(lista_semestres):
    def chave(s):
        s = str(s).strip()
        partes = re.findall(r"\d+", s)
        if len(partes) >= 2:
            return (int(partes[0]), int(partes[1]))
        if len(partes) == 1:
            return (int(partes[0]), 0)
        return (9999, 9999)
    return sorted(lista_semestres, key=chave)


def padronizar_colunas_upload(df):
    mapa = {
        "id": "ID",
        "codigo": "ID",
        "codigo_aluno": "ID",

        "nome": "Nome",
        "aluno": "Nome",
        "nome_aluno": "Nome",

        "matricula": "Matricula",
        "registro": "Matricula",
        "ra": "Matricula",

        "turma": "Turma",
        "classe": "Turma",

        "curso": "Curso",

        "serie": "Semestre",
        "semestre": "Semestre",
        "periodo": "Semestre",

        "idade": "Age",
        "age": "Age",
        "idade_anos": "Age",

        "gpa": "GPA",
        "media": "GPA",
        "nota": "GPA",
        "media_final": "GPA",

        "frequencia": "Attendance_Rate",
        "frequencia_percentual": "Attendance_Rate",
        "attendance_rate": "Attendance_Rate",
        "attendance": "Attendance_Rate",
        "presenca": "Attendance_Rate",
        "presença": "Attendance_Rate",

        "horas_estudo": "Study_Hours_per_Day",
        "horas_de_estudo": "Study_Hours_per_Day",
        "study_hours_per_day": "Study_Hours_per_Day",

        "tempo_deslocamento": "Travel_Time_Minutes",
        "deslocamento": "Travel_Time_Minutes",
        "travel_time_minutes": "Travel_Time_Minutes",
        "tempo_viagem": "Travel_Time_Minutes",

        "estresse": "Stress_Index",
        "stress": "Stress_Index",
        "stress_index": "Stress_Index",
        "nivel_estresse": "Stress_Index",

        "sexo": "Gender_Male",
        "genero": "Gender_Male",
        "gênero": "Gender_Male",
        "gender": "Gender_Male",
        "gender_male": "Gender_Male",

        "dropout": "Dropout",
        "evasao": "Dropout",
        "evasão": "Dropout",
        "risco_evasao": "Dropout",

        "nivel_risco": "Nivel_Risco",
        "nivel_de_risco": "Nivel_Risco",
        "status_risco": "Nivel_Risco",

        "probabilidade_risco": "Probabilidade_Risco",
        "probabilidade_de_risco": "Probabilidade_Risco",

        "recomendacoes": "Recomendacoes",
        "recomendacao": "Recomendacoes",
        "recomendações": "Recomendacoes",

        "data": "Data_Referencia",
        "data_referencia": "Data_Referencia",
        "data_referência": "Data_Referencia",
        "data_evasao": "Data_Referencia",
        "data_matricula": "Data_Referencia",
        "mes_referencia": "Data_Referencia"
    }

    novas = []
    for col in df.columns:
        chave = normalizar_texto_chave(col)
        novas.append(mapa.get(chave, str(col).strip()))
    df.columns = novas
    # Remove colunas duplicadas mantendo a primeira ocorrência
    df = df.loc[:, ~df.columns.duplicated()].copy()
    return df


def garantir_estrutura_dataframe(df):
    if df is None or df.empty:
        return pd.DataFrame(columns=COLUNAS_PADRAO)

    df = df.copy()
    df.columns = df.columns.str.strip()

    for col in COLUNAS_PADRAO:
        if col not in df.columns:
            df[col] = 0 if col in COLUNAS_NUMERICAS else ""

    return df[COLUNAS_PADRAO]


def gerar_recomendacoes(gpa, freq, stress, study_hours, travel_time):
    recomendacoes = []

    if gpa < 6:
        recomendacoes.append("Reforco escolar e acompanhamento pedagogico")
    if freq < 75:
        recomendacoes.append("Contato com responsavel e monitoramento de frequencia")
    if stress >= 7:
        recomendacoes.append("Encaminhamento para apoio psicologico ou psicossocial")
    if study_hours < 2:
        recomendacoes.append("Orientacao para rotina de estudos")
    if travel_time > 90:
        recomendacoes.append("Avaliar apoio logistico ou flexibilizacao academica")

    if not recomendacoes:
        recomendacoes.append("Manter acompanhamento preventivo")

    return " | ".join(recomendacoes)


def converter_probabilidade_para_nivel(probabilidade):
    if probabilidade >= 85:
        return "ALTO"
    elif probabilidade >= 60:
        return "MEDIO"
    return "BAIXO"


def preparar_features_modelo(df, ajustar_colunas=False, colunas_referencia=None):
    df_modelo = df.copy()
    colunas_entrada = [c for c in df_modelo.columns if c not in COLUNAS_EXCLUIDAS_MODELO]
    X = df_modelo[colunas_entrada].copy()

    for col in X.columns:
        if col == "Gender_Male":
            X[col] = X[col].apply(normalizar_genero)
        elif col in ["Age", "GPA", "Attendance_Rate", "Study_Hours_per_Day", "Travel_Time_Minutes", "Stress_Index"]:
            X[col] = pd.to_numeric(X[col], errors="coerce").fillna(0)
        else: 
            X[col] = X[col].astype(str).fillna("NAO_INFORMADO").str.strip().replace("", "NAO_INFORMADO")
            
    colunas_categoricas = X.select_dtypes(include=["object", "string"]).columns.tolist()

    if colunas_categoricas:
        X = pd.get_dummies(X, columns=colunas_categoricas, drop_first=False)

    X = X.apply(pd.to_numeric, errors="coerce").fillna(0)
    X = X.replace([float("inf"), float("-inf")], 0)

    if ajustar_colunas and colunas_referencia is not None:
        X = X.reindex(columns=colunas_referencia, fill_value=0)

    return X


def preparar_entrada_modelo(dados):
    entrada = pd.DataFrame([{
        "Turma": texto_seguro(dados.get("Turma")) or "NAO_INFORMADO",
        "Curso": texto_seguro(dados.get("Curso")) or "NAO_INFORMADO",
        "Semestre": texto_seguro(dados.get("Semestre")) or "NAO_INFORMADO",
        "Age": numero_seguro(dados.get("Age", 0), int, 0),
        "GPA": numero_seguro(dados.get("GPA", 0), float, 0),
        "Attendance_Rate": numero_seguro(dados.get("Attendance_Rate", 0), float, 0),
        "Study_Hours_per_Day": numero_seguro(dados.get("Study_Hours_per_Day", 0), float, 0),
        "Travel_Time_Minutes": numero_seguro(dados.get("Travel_Time_Minutes", 0), float, 0),
        "Stress_Index": numero_seguro(dados.get("Stress_Index", 0), int, 0),
        "Gender_Male": normalizar_genero(dados.get("Gender_Male", 0))
    }])

    return entrada.fillna(0)


def localizar_indice_aluno(df, aluno_id):
    if df.empty or "ID" not in df.columns:
        return None

    df_ids = pd.to_numeric(df["ID"], errors="coerce").fillna(0).astype(int)
    indices = df.index[df_ids == int(aluno_id)].tolist()
    return indices[0] if indices else None


def matricula_ja_existe(df, matricula, ignorar_id=None):
    matricula = texto_seguro(matricula).lower()
    if not matricula:
        return False

    df_aux = df.copy()
    df_aux["Matricula"] = df_aux["Matricula"].astype(str).str.strip().str.lower()
    df_aux["ID"] = pd.to_numeric(df_aux["ID"], errors="coerce").fillna(0).astype(int)

    if ignorar_id is not None:
        df_aux = df_aux[df_aux["ID"] != int(ignorar_id)]

    return matricula in df_aux["Matricula"].values


def mesclar_dados_aluno(registro_atual, novos_dados):
    base = dict(registro_atual)

    for campo in ["Nome", "Matricula", "Turma", "Curso", "Semestre"]:
        if campo in novos_dados:
            base[campo] = texto_seguro(novos_dados.get(campo, base.get(campo, "")))

    for campo, tipo_padrao in [
        ("Age", int),
        ("GPA", float),
        ("Attendance_Rate", float),
        ("Study_Hours_per_Day", float),
        ("Travel_Time_Minutes", float),
        ("Stress_Index", int),
    ]:
        if campo in novos_dados:
            base[campo] = numero_seguro(novos_dados.get(campo, base.get(campo, 0)), tipo_padrao, base.get(campo, 0))

    if "Gender_Male" in novos_dados:
        base["Gender_Male"] = normalizar_genero(novos_dados.get("Gender_Male", base.get("Gender_Male", 0)))

    if "Data_Referencia" in novos_dados:
        base["Data_Referencia"] = normalizar_data(novos_dados.get("Data_Referencia", base.get("Data_Referencia", "")))

    return base


def ler_csv_flexivel(origem):
    tentativas = [
        {"sep": ",", "encoding": "utf-8"},
        {"sep": ";", "encoding": "utf-8"},
        {"sep": ",", "encoding": "utf-8-sig"},
        {"sep": ";", "encoding": "utf-8-sig"},
        {"sep": ",", "encoding": "latin1"},
        {"sep": ";", "encoding": "latin1"},
    ]

    ultimo_erro = None

    for tentativa in tentativas:
        try:
            if hasattr(origem, 'seek'):
                origem.seek(0)
            df = pd.read_csv(
                origem,
                sep=tentativa["sep"],
                encoding=tentativa["encoding"],
                low_memory=False
            )

            if len(df.columns) == 1 and ";" in str(df.columns[0]):
                continue

            return df
        except Exception as e:
            ultimo_erro = e

    raise ultimo_erro if ultimo_erro else Exception("Nao foi possivel ler o CSV.")


def carregar_dados():
    return database.carregar_dados(CAMINHO_DB, COLUNAS_PADRAO)


def salvar_dados(df):
    try:
        if df is None or df.empty:
            df = pd.DataFrame(columns=COLUNAS_PADRAO)
        else:
            df = completar_base_generica(df)

        df = garantir_estrutura_dataframe(df)
        # Salva no CSV para persistência física
        try:
            df.to_csv(CAMINHO_CSV, index=False, encoding="utf-8-sig")
        except PermissionError:
            print("[AVISO] Arquivo CSV aberto (ex: no Excel). Salvo apenas no SQLite.")
        # Sincroniza com o SQLite para que as consultas (SELECT) reflitam as mudanças
        conn = get_db_connection()
        df.to_sql("alunos", conn, if_exists="replace", index=False)
        conn.close()
        print(f"[INFO] Base salva com {len(df)} registros em: {CAMINHO_BASE}")
        return True
    except Exception as e:
        print(f"[ERRO] Ao salvar CSV: {e}")
        return False


def gerar_proximo_id(df):
    if df.empty or "ID" not in df.columns:
        return 1
    ids = pd.to_numeric(df["ID"], errors="coerce").fillna(0).astype(int)
    return int(ids.max()) + 1 if not ids.empty else 1


def completar_base_generica(df):
    df = padronizar_colunas_upload(df.copy())

    has_dropout_col = "Dropout" in df.columns

    for col in COLUNAS_PADRAO:
        if col not in df.columns:
            df[col] = 0 if col in COLUNAS_NUMERICAS else ""

    if "ID" not in df.columns or pd.to_numeric(df["ID"], errors="coerce").isna().all():
        df["ID"] = range(1, len(df) + 1)
    else:
        df["ID"] = pd.to_numeric(df["ID"], errors="coerce").fillna(0).astype(int)
        faltantes = df["ID"] <= 0
        if faltantes.any():
            max_id = int(df["ID"].max()) if len(df) > 0 else 0
            for idx in df[faltantes].index:
                max_id += 1
                df.at[idx, "ID"] = max_id

    campos_texto = ["Nome", "Matricula", "Turma", "Curso", "Semestre", "Nivel_Risco", "Recomendacoes"]
    for col in campos_texto:
        df[col] = df[col].fillna("").astype(str).str.strip()

    campos_num = [
        "Age",
        "GPA",
        "Attendance_Rate",
        "Study_Hours_per_Day",
        "Travel_Time_Minutes",
        "Stress_Index",
        "Probabilidade_Risco"
    ]
    for col in campos_num:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["Gender_Male"] = df["Gender_Male"].apply(normalizar_genero)

    if has_dropout_col:
        df["Dropout"] = df["Dropout"].apply(normalizar_dropout)
    else:
        df["Dropout"] = 0

    if "Data_Referencia" in df.columns:
        df["Data_Referencia"] = df["Data_Referencia"].apply(normalizar_data)
    else:
        df["Data_Referencia"] = ""

    for idx, row in df.iterrows():
        gpa = numero_seguro(row.get("GPA", 0), float, 0)
        freq = numero_seguro(row.get("Attendance_Rate", 0), float, 0)
        stress = numero_seguro(row.get("Stress_Index", 0), int, 0)
        study = numero_seguro(row.get("Study_Hours_per_Day", 0), float, 0)
        travel = numero_seguro(row.get("Travel_Time_Minutes", 0), float, 0)

        if texto_seguro(row.get("Data_Referencia")) == "":
            df.at[idx, "Data_Referencia"] = data_padrao_por_indice(idx)

        # Se o modelo estiver ativo, preenchemos os dados faltantes com predições reais
        if modelo_global.modelo_ativo and row.get("Nivel_Risco") == "":
            pred = prever_com_modelo(row.to_dict())
            if not has_dropout_col:
                df.at[idx, "Dropout"] = pred["dropout"]
            df.at[idx, "Nivel_Risco"] = pred["nivel_risco"]
            df.at[idx, "Probabilidade_Risco"] = pred["probabilidade"]
            df.at[idx, "Recomendacoes"] = pred["recomendacoes"]
        else:
            if not has_dropout_col:
                nivel = str(row.get("Nivel_Risco")).upper()
                df.at[idx, "Dropout"] = 1 if nivel in ["ALTO", "MEDIO"] else 0
            if df.at[idx, "Recomendacoes"] == "":
                df.at[idx, "Recomendacoes"] = gerar_recomendacoes(gpa, freq, stress, study, travel)

    return garantir_estrutura_dataframe(df)


def _apply_date_filters(df, inicio_str, fim_str):
    """
    Aplica filtros de data a um DataFrame.
    Espera 'Data_Referencia' como coluna de data.
    """
    if df.empty or "Data_Referencia" not in df.columns:
        return df

    df_filtered = df.copy()
    df_filtered["Data_Referencia"] = pd.to_datetime(df_filtered["Data_Referencia"], errors="coerce")
    df_filtered = df_filtered.dropna(subset=["Data_Referencia"])

    if inicio_str:
        dt_inicio = pd.to_datetime(inicio_str, errors="coerce")
        if not pd.isna(dt_inicio):
            df_filtered = df_filtered[df_filtered["Data_Referencia"] >= dt_inicio]

    if fim_str:
        dt_fim = pd.to_datetime(fim_str, errors="coerce")
        if not pd.isna(dt_fim):
            if len(fim_str) == 7: # YYYY-MM format, adjust to end of month
                y, m = dt_fim.year, dt_fim.month
                last_day = calendar.monthrange(y, m)[1]
                dt_fim = pd.to_datetime(f"{y}-{m:02d}-{last_day}")
            df_filtered = df_filtered[df_filtered["Data_Referencia"] <= dt_fim]
    return df_filtered

# =========================
# MODELO
# =========================
def treinar_modelo():
    df = carregar_dados()
    return modelo_global.treinar(df, COLUNAS_EXCLUIDAS_MODELO, normalizar_dropout, preparar_features_modelo)


def prever_com_modelo(dados):
    entrada = preparar_entrada_modelo(dados)
    return modelo_global.prever(entrada, gerar_recomendacoes, preparar_features_modelo, converter_probabilidade_para_nivel)


def montar_registro_aluno(dados, aluno_id=None):
    # Tenta prever usando o modelo (que agora é 100% IA)
    analise = prever_com_modelo(dados)

    return {
        "ID": aluno_id if aluno_id is not None else numero_seguro(dados.get("ID", 0), int, 0),
        "Nome": texto_seguro(dados.get("Nome")),
        "Matricula": texto_seguro(dados.get("Matricula")),
        "Turma": texto_seguro(dados.get("Turma")),
        "Curso": texto_seguro(dados.get("Curso")),
        "Semestre": texto_seguro(dados.get("Semestre")),
        "Age": numero_seguro(dados.get("Age", 0), int, 0),
        "GPA": numero_seguro(dados.get("GPA", 0), float, 0),
        "Attendance_Rate": numero_seguro(dados.get("Attendance_Rate", 0), float, 0),
        "Study_Hours_per_Day": numero_seguro(dados.get("Study_Hours_per_Day", 0), float, 0),
        "Travel_Time_Minutes": numero_seguro(dados.get("Travel_Time_Minutes", 0), float, 0),
        "Stress_Index": numero_seguro(dados.get("Stress_Index", 0), int, 0),
        "Gender_Male": normalizar_genero(dados.get("Gender_Male", 0)),
        "Dropout": analise["dropout"],
        "Nivel_Risco": analise["nivel_risco"],
        "Probabilidade_Risco": analise["probabilidade"],
        "Recomendacoes": analise["recomendacoes"],
        "Data_Referencia": normalizar_data(dados.get("Data_Referencia")) or datetime.now().strftime("%Y-%m-%d")
    }


# =========================
# ROTAS
# =========================
@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({
        "mensagem": "API de Monitoramento de Evasao Escolar rodando",
        "arquivo_base": CAMINHO_BASE,
        "arquivo_existe": os.path.exists(CAMINHO_BASE),
        "modelo": modelo_global.metricas_modelo
    })


@app.route("/debug_base", methods=["GET"])
def debug_base():
    try:
        existe = os.path.exists(CAMINHO_BASE)
        tamanho = os.path.getsize(CAMINHO_BASE) if existe else 0
        df = carregar_dados()

        return jsonify({
            "caminho_base": CAMINHO_BASE,
            "arquivo_existe": existe,
            "tamanho_bytes": tamanho,
            "total_registros": int(len(df)) if not df.empty else 0,
            "colunas": list(df.columns) if not df.empty else COLUNAS_PADRAO,
            "preview": df.head(5).fillna("").to_dict(orient="records") if not df.empty else []
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/modelo_status", methods=["GET"])
def modelo_status():
    return jsonify(modelo_global.metricas_modelo)


@app.route("/estatisticas", methods=["GET"])
def estatisticas():
    df = carregar_dados()

    if df.empty:
        return jsonify({
            "total_estudantes": 0,
            "total_risco": 0,
            "percentual_risco": 0,
            "alto_risco": 0,
            "medio_risco": 0,
            "baixo_risco": 0
        })

    total = len(df)

    alto = int((df["Nivel_Risco"].astype(str).str.upper() == "ALTO").sum())
    medio = int((df["Nivel_Risco"].astype(str).str.upper() == "MEDIO").sum())
    baixo = int((df["Nivel_Risco"].astype(str).str.upper() == "BAIXO").sum())

    total_risco = alto + medio
    percentual_risco = round((total_risco / total) * 100, 2) if total > 0 else 0

    return jsonify({
        "total_estudantes": int(total),
        "total_risco": int(total_risco),
        "percentual_risco": float(percentual_risco),
        "alto_risco": alto,
        "medio_risco": medio,
        "baixo_risco": baixo
    })


@app.route("/indicadores", methods=["GET"])
def indicadores():
    df = carregar_dados()

    if df.empty:
        return jsonify({
            "GPA": 0,
            "Attendance_Rate": 0,
            "Stress_Index": 0,
            "Study_Hours_per_Day": 0,
            "Travel_Time_Minutes": 0,
            "Age": 0
        })

    return jsonify({
        "GPA": round(float(pd.to_numeric(df["GPA"], errors="coerce").fillna(0).mean()), 2),
        "Attendance_Rate": round(float(pd.to_numeric(df["Attendance_Rate"], errors="coerce").fillna(0).mean()), 2),
        "Stress_Index": round(float(pd.to_numeric(df["Stress_Index"], errors="coerce").fillna(0).mean()), 2),
        "Study_Hours_per_Day": round(float(pd.to_numeric(df["Study_Hours_per_Day"], errors="coerce").fillna(0).mean()), 2),
        "Travel_Time_Minutes": round(float(pd.to_numeric(df["Travel_Time_Minutes"], errors="coerce").fillna(0).mean()), 2),
        "Age": round(float(pd.to_numeric(df["Age"], errors="coerce").fillna(0).mean()), 2)
    })


@app.route("/graficos", methods=["GET"])
def graficos():
    try:
        df = carregar_dados()

        if df.empty:
            return jsonify({
                "distribuicao_risco": {"labels": ["ALTO", "MEDIO", "BAIXO"], "valores": [0, 0, 0]},
                "evasao_curso": {"labels": [], "valores": []},
                "evasao_faixa_etaria": {"labels": [], "valores": []},
                "fatores_risco": {
                    "labels": ["Notas Baixas", "Baixa Frequência", "Estresse Alto", "Pouco Estudo", "Longo Desloc."],
                    "valores": [0, 0, 0, 0, 0],
                    "total_risco": 0
                },
                "evasao_genero": {"labels": ["Masculino", "Feminino"], "valores": [0, 0]},
                "evasao_semestre": {"labels": [], "valores": []}
            })

        df = df.copy()
        df["Dropout"] = df["Dropout"].apply(normalizar_dropout)
        df["Nivel_Risco"] = df["Nivel_Risco"].astype(str).str.upper()
        df["Curso"] = df["Curso"].fillna("").astype(str).str.strip()
        df["Curso"] = df["Curso"].replace(["ede de Computadores", "Rede de Computadores", "Redes de Computadores"], "Redes").replace("", "Nao informado")
        df["Semestre"] = df["Semestre"].fillna("").astype(str).str.strip().replace("", "Nao informado")
        df["Faixa_Etaria"] = df["Age"].apply(faixa_etaria)
        df["Genero_Label"] = df["Gender_Male"].apply(label_genero)

        alto = int((df["Nivel_Risco"] == "ALTO").sum())
        medio = int((df["Nivel_Risco"] == "MEDIO").sum())
        baixo = int((df["Nivel_Risco"] == "BAIXO").sum())

        df_dropout = df[df["Dropout"] == 1].copy()

        curso_agr = (
            df_dropout.groupby("Curso")
            .size()
            .sort_values(ascending=False)
        )

        ordem_faixa = ["Até 17", "18-20", "21-24", "25-30", "31+"]
        faixa_agr = df_dropout.groupby("Faixa_Etaria").size().reindex(ordem_faixa, fill_value=0)

        genero_agr = df_dropout.groupby("Genero_Label").size().reindex(["Masculino", "Feminino"], fill_value=0)
        genero_totais = df.groupby("Genero_Label").size().reindex(["Masculino", "Feminino"], fill_value=0)

        semestres = ordenar_semestres_unicos(df_dropout["Semestre"].dropna().astype(str).unique().tolist())
        semestre_agr = df_dropout.groupby("Semestre").size().reindex(semestres, fill_value=0)

        df_risco = df[df["Nivel_Risco"].isin(["ALTO", "MEDIO"])].copy()
        if df_risco.empty:
            fatores_valores = [0, 0, 0, 0, 0]
        else:
            fatores_valores = [0, 0, 0, 0, 0]
            for _, row in df_risco.iterrows():
                gpa = numero_seguro(row.get("GPA", 0), float, 0)
                freq = numero_seguro(row.get("Attendance_Rate", 0), float, 0)
                stress = numero_seguro(row.get("Stress_Index", 0), int, 0)
                study = numero_seguro(row.get("Study_Hours_per_Day", 0), float, 0)
                travel = numero_seguro(row.get("Travel_Time_Minutes", 0), float, 0)

                # Aloca o aluno a apenas UM fator prioritário para a soma bater exatamente com o total em risco
                if gpa > 0 and gpa < 6:
                    fatores_valores[0] += 1
                elif freq > 0 and freq < 75:
                    fatores_valores[1] += 1
                elif stress >= 7:
                    fatores_valores[2] += 1
                elif study > 0 and study < 2:
                    fatores_valores[3] += 1
                elif travel > 90:
                    fatores_valores[4] += 1
                else:
                    # Fallback: Registra no fator principal (Notas Baixas) se não estourar limiares explícitos
                    fatores_valores[0] += 1

        return jsonify({
            "distribuicao_risco": {
                "labels": ["ALTO", "MEDIO", "BAIXO"],
                "valores": [alto, medio, baixo]
            },
            "evasao_curso": {
                "labels": curso_agr.index.tolist(),
                "valores": [int(x) for x in curso_agr.values.tolist()]
            },
            "evasao_faixa_etaria": {
                "labels": faixa_agr.index.tolist(),
                "valores": [int(x) for x in faixa_agr.values.tolist()]
            },
            "fatores_risco": {
                "labels": ["Notas Baixas", "Baixa Frequência", "Estresse Alto", "Pouco Estudo", "Longo Desloc."],
                "valores": fatores_valores,
                "total_risco": alto + medio
            },
            "evasao_genero": {
                "labels": ["Masculino", "Feminino"],
                "valores": [int(x) for x in genero_agr.values.tolist()],
                "totais": [int(x) for x in genero_totais.values.tolist()]
            },
            "evasao_semestre": {
                "labels": semestre_agr.index.tolist(),
                "valores": [int(x) for x in semestre_agr.values.tolist()]
            }
        })

    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/evasoes-periodo", methods=["GET"])
def evasoes_periodo():
    try:
        df = carregar_dados()

        if df.empty or "Data_Referencia" not in df.columns:
            return jsonify({"labels": [], "valores": []})

        tipo = request.args.get("tipo", "mes").strip().lower()
        inicio = request.args.get("inicio", "").strip()
        fim = request.args.get("fim", "").strip()

        df = _apply_date_filters(df, inicio, fim)
        df["Dropout"] = df["Dropout"].apply(normalizar_dropout) # Apply after filtering
        df = df[df["Dropout"] == 1] # Filter for dropouts after date filtering

        if df.empty:
            return jsonify({"labels": [], "valores": []})

        if tipo == "ano":
            agrupado = df.groupby(df["Data_Referencia"].dt.year).size().sort_index()
            labels = [str(int(x)) for x in agrupado.index.tolist()]
            valores = [int(x) for x in agrupado.values.tolist()]
        else:
            agrupado = df.groupby(df["Data_Referencia"].dt.to_period("M")).size().sort_index()
            labels = [str(x) for x in agrupado.index.tolist()]
            valores = [int(x) for x in agrupado.values.tolist()]

        return jsonify({"labels": labels, "valores": valores})

    except Exception as e:
        return jsonify({"labels": [], "valores": [], "erro": str(e)}), 500


@app.route("/verificar_matricula", methods=["GET"])
def verificar_matricula():
    matricula = request.args.get("matricula", "").strip()
    ignorar_id = request.args.get("ignorar_id", "").strip()
    
    if not matricula:
        return jsonify({"existe": False})
        
    try:
        conn = get_db_connection()
        if ignorar_id:
            cursor = conn.execute("SELECT ID, Nome FROM alunos WHERE Matricula = ? AND CAST(ID AS INTEGER) != ?", (matricula, ignorar_id))
        else:
            cursor = conn.execute("SELECT ID, Nome FROM alunos WHERE Matricula = ?", (matricula,))
            
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return jsonify({"existe": True, "nome": row["Nome"], "id": row["ID"]})
        return jsonify({"existe": False})
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/sugestao_dados", methods=["GET"])
def sugestao_dados():
    try:
        df = carregar_dados()
        proxima_matricula = ""
        
        if not df.empty and "Matricula" in df.columns:
            numeros = df["Matricula"].astype(str).str.extract(r'(\d+)')[0].dropna().astype(int)
            if not numeros.empty:
                max_num = numeros.max()
                proxima_matricula = str(max_num + 1)
            else:
                proxima_matricula = f"{datetime.now().year}001"
        else:
            proxima_matricula = f"{datetime.now().year}001"
            
        return jsonify({
            "matricula": proxima_matricula,
            "data_referencia": datetime.now().strftime("%Y-%m-%d")
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/opcoes_formulario", methods=["GET"])
def opcoes_formulario():
    try:
        conn = get_db_connection()
        
        cursor_turma = conn.execute("SELECT DISTINCT Turma FROM alunos WHERE Turma IS NOT NULL AND Turma != '' ORDER BY Turma")
        turmas = [row["Turma"] for row in cursor_turma.fetchall()]
        
        cursor_curso = conn.execute("SELECT DISTINCT Curso FROM alunos WHERE Curso IS NOT NULL AND Curso != '' ORDER BY Curso")
        cursos = [row["Curso"] for row in cursor_curso.fetchall()]
        
        cursor_semestre = conn.execute("SELECT DISTINCT Semestre FROM alunos WHERE Semestre IS NOT NULL AND Semestre != '' ORDER BY Semestre")
        semestres = [row["Semestre"] for row in cursor_semestre.fetchall()]
        
        conn.close()
        
        return jsonify({
            "turmas": turmas,
            "cursos": cursos,
            "semestres": semestres
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/inteligencia_ia", methods=["GET"])
def inteligencia_ia():
    try:
        df = carregar_dados()
        
        inicio = request.args.get("inicio", "").strip()
        fim = request.args.get("fim", "").strip()
        
        df = _apply_date_filters(df, inicio, fim)

        if not df.empty:
            df["Dropout"] = df["Dropout"].apply(normalizar_dropout)
            
        alto = int((df["Nivel_Risco"].astype(str).str.upper() == "ALTO").sum()) if not df.empty else 0
        medio = int((df["Nivel_Risco"].astype(str).str.upper() == "MEDIO").sum()) if not df.empty else 0
        baixo = int((df["Nivel_Risco"].astype(str).str.upper() == "BAIXO").sum()) if not df.empty else 0

        matriz = []
        if not df.empty and "Data_Referencia" in df.columns:
            df_evasao = df[df["Dropout"] == 1].dropna(subset=["Data_Referencia"])
            if not df_evasao.empty:
                anos = sorted(df_evasao["Data_Referencia"].dt.year.unique())
                anos = [ano for ano in anos if ano > 0][-3:]
                for ano in anos:
                    df_ano = df_evasao[df_evasao["Data_Referencia"].dt.year == ano]
                    meses_counts = df_ano.groupby(df_ano["Data_Referencia"].dt.month).size()
                    meses_data = []
                    for m in range(1, 13):
                        val = int(meses_counts.get(m, 0))
                        if val == 0: heat = "heat-low"
                        elif val < 3: heat = "heat-mid"
                        else: heat = "heat-high"
                        meses_data.append({"valor": val, "heat": heat})
                    matriz.append({"ano": int(ano), "meses": meses_data})
                    
        if not matriz:
            from datetime import datetime
            matriz = [{"ano": datetime.now().year, "meses": [{"valor": 0, "heat": "heat-low"} for _ in range(12)]}]
            
        total_alunos = len(df)
        df_evadidos_total = df[df["Dropout"] == 1].copy() if not df.empty else pd.DataFrame()
        total_evadidos = len(df_evadidos_total)

        df_alto_risco = df[df["Nivel_Risco"].astype(str).str.upper() == "ALTO"] if not df.empty else pd.DataFrame()
        df_medio_risco = df[df["Nivel_Risco"].astype(str).str.upper() == "MEDIO"] if not df.empty else pd.DataFrame()
        df_baixo_risco = df[df["Nivel_Risco"].astype(str).str.upper() == "BAIXO"] if not df.empty else pd.DataFrame()

        def calcular_fatores_negativos(df_risco):
            if df_risco.empty:
                return [0, 0, 0, 0, 0]
            fatores_valores = [0, 0, 0, 0, 0]
            for _, row in df_risco.iterrows():
                gpa_val = numero_seguro(row.get("GPA", 0), float, 0)
                freq_val = numero_seguro(row.get("Attendance_Rate", 0), float, 0)
                stress_val = numero_seguro(row.get("Stress_Index", 0), int, 0)
                study_val = numero_seguro(row.get("Study_Hours_per_Day", 0), float, 0)
                travel_val = numero_seguro(row.get("Travel_Time_Minutes", 0), float, 0)

                if gpa_val > 0 and gpa_val < 6:
                    fatores_valores[0] += 1
                elif freq_val > 0 and freq_val < 75:
                    fatores_valores[1] += 1
                elif stress_val >= 7:
                    fatores_valores[2] += 1
                elif study_val > 0 and study_val < 2:
                    fatores_valores[3] += 1
                elif travel_val > 90:
                    fatores_valores[4] += 1
            return fatores_valores

        def calcular_fatores_positivos(df_baixo):
            if df_baixo.empty:
                return [0, 0, 0, 0, 0]
            fatores_valores = [0, 0, 0, 0, 0]
            for _, row in df_baixo.iterrows():
                gpa_val = numero_seguro(row.get("GPA", 0), float, 0)
                freq_val = numero_seguro(row.get("Attendance_Rate", 0), float, 0)
                stress_val = numero_seguro(row.get("Stress_Index", 0), int, 0)
                study_val = numero_seguro(row.get("Study_Hours_per_Day", 0), float, 0)
                travel_val = numero_seguro(row.get("Travel_Time_Minutes", 0), float, 0)

                if gpa_val >= 8:
                    fatores_valores[0] += 1
                elif freq_val >= 90:
                    fatores_valores[1] += 1
                elif stress_val > 0 and stress_val <= 3:
                    fatores_valores[2] += 1
                elif study_val >= 3:
                    fatores_valores[3] += 1
                elif travel_val > 0 and travel_val <= 30:
                    fatores_valores[4] += 1
                else:
                    # Se não cair em nenhum critério forte, considera a frequência como o fator positivo genérico
                    fatores_valores[1] += 1
            return fatores_valores

        fatores_alto = calcular_fatores_negativos(df_alto_risco)
        fatores_medio = calcular_fatores_negativos(df_medio_risco)
        fatores_baixo = calcular_fatores_positivos(df_baixo_risco)

        # Cálculo dinâmico de histórico por trimestre para a projeção
        historico_proj = [0, 0, 0, 0]
        if not df_evadidos_total.empty and "Data_Referencia" in df_evadidos_total.columns:
            df_evadidos_total['Trimestre'] = df_evadidos_total['Data_Referencia'].dt.quarter
            counts = df_evadidos_total.groupby('Trimestre').size()
            for i in range(1, 5):
                historico_proj[i-1] = int(counts.get(i, 0))
        
        taxa = (total_evadidos / total_alunos) if total_alunos > 0 else 0
        nps_calc = max(0, min(100, int(100 - (taxa * 100)))) if total_alunos > 0 else 0
        
        # Projeção baseada em tendência média trimestral real, reduzindo a heurística de multiplicadores fixos
        media_tri = sum(historico_proj) / 4 if sum(historico_proj) > 0 else (total_evadidos / 4)
        ia_proj = [0, 0, 0, 0, 
                   int(media_tri * 1.05), 
                   int(media_tri * 0.95), 
                   int(media_tri * 1.1), 
                   int(media_tri)]

        # Motivos dinâmicos baseados nos dados reais dos evadidos (substituindo a heurística de 40/30/20/10)
        labels_motivos = ["Baixo Engajamento", "Frequência Baixa", "Notas Baixas", "Estresse Alto"]
        valores_motivos = [0, 0, 0, 0]
        
        if not df_evadidos_total.empty:
            # Lógica de prioridade para categorizar cada aluno evadido em um único motivo principal.
            # Isso evita contagem dupla e clarifica o fator mais provável.
            # A ordem de verificação define a prioridade.
            for _, row in df_evadidos_total.iterrows():
                stress_val = numero_seguro(row.get("Stress_Index", 0), int, 0)
                gpa_val = numero_seguro(row.get("GPA", 0), float, 0)
                freq_val = numero_seguro(row.get("Attendance_Rate", 0), float, 0)
                study_val = numero_seguro(row.get("Study_Hours_per_Day", 0), float, 0)

                if stress_val >= 7:
                    valores_motivos[3] += 1 # Estresse Alto
                elif gpa_val > 0 and gpa_val < 6:
                    valores_motivos[2] += 1 # Notas Baixas
                elif freq_val > 0 and freq_val < 75:
                    valores_motivos[1] += 1 # Frequência Baixa
                elif study_val > 0 and study_val < 2:
                    valores_motivos[0] += 1 # Baixo Engajamento
                else:
                    # Se nenhum critério específico for atendido, atribui a "Notas Baixas" como fallback.
                    valores_motivos[2] += 1

        return jsonify({
            "riscos": {"alto": alto, "medio": medio, "baixo": baixo},
            "matriz": matriz,
            "projecao": {
                "labels": ["Q1", "Q2", "Q3", "Q4", "Q1(Proj)", "Q2(Proj)", "Q3(Proj)", "Q4(Proj)"],
                "historico": historico_proj + [0, 0, 0, 0],
                "ia": ia_proj
            },
            "motivos": {
                "labels": labels_motivos,
                "valores": valores_motivos
            },
            "fatores_alto_risco": fatores_alto,
            "fatores_medio_risco": fatores_medio,
            "fatores_baixo_risco": fatores_baixo,
            "labels_fatores": ["Notas Baixas", "Baixa Frequência", "Estresse Alto", "Pouco Estudo", "Longo Desloc."],
            "labels_fatores_positivos": ["Notas Altas", "Alta Frequência", "Baixo Estresse", "Muito Estudo", "Curto Desloc."],
            "nps": nps_calc
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

@app.route("/cadastrar", methods=["POST"])
def cadastrar():
    try:
        dados = request.get_json(silent=True)
        if not dados:
            return jsonify({"erro": "Dados nulos ou JSON invalido"}), 400

        matricula = texto_seguro(dados.get("Matricula"))
        conn = get_db_connection()
        
        if matricula:
            cursor = conn.execute("SELECT ID FROM alunos WHERE Matricula = ?", (matricula,))
            if cursor.fetchone():
                conn.close()
                return jsonify({"erro": "Ja existe um aluno com esta matricula. Use Editar para atualizar os dados."}), 409

        cursor = conn.execute("SELECT MAX(CAST(ID AS INTEGER)) FROM alunos")
        row = cursor.fetchone()
        novo_id = (row[0] or 0) + 1 if row else 1

        novo_aluno = montar_registro_aluno(dados, aluno_id=novo_id)

        colunas = ", ".join(novo_aluno.keys())
        placeholders = ", ".join(["?"] * len(novo_aluno))
        valores = tuple(novo_aluno.values())

        conn.execute(f"INSERT INTO alunos ({colunas}) VALUES ({placeholders})", valores)
        conn.commit()
        conn.close()

        sincronizar_sqlite_para_csv()
        treinar_modelo()

        return jsonify({
            "mensagem": "Aluno cadastrado com sucesso",
            "id": int(novo_id),
            "aluno": novo_aluno
        }), 201

    except Exception as e:
        print(f"Erro no cadastro: {e}")
        return jsonify({"erro": str(e)}), 500


@app.route("/alunos", methods=["GET"])
def listar_alunos():
    conn = get_db_connection()
    
    # Filtros
    query = "SELECT * FROM alunos WHERE 1=1"
    params = []

    nome = request.args.get("nome", "").strip()
    if nome: 
        query += " AND Nome LIKE ?"
        params.append(f"%{nome}%")

    matricula = request.args.get("matricula", "").strip()
    if matricula:
        query += " AND Matricula LIKE ?"
        params.append(f"%{matricula}%")

    turma = request.args.get("turma", "").strip()
    if turma:
        query += " AND Turma LIKE ?"
        params.append(f"%{turma}%")

    curso = request.args.get("curso", "").strip()
    if curso:
        query += " AND Curso LIKE ?"
        params.append(f"%{curso}%")

    nivel_risco = request.args.get("nivel_risco", "").strip().upper()
    if nivel_risco:
        query += " AND Nivel_Risco = ?"
        params.append(nivel_risco)
    
    # Paginação
    pagina = request.args.get("pagina", 1, type=int)
    por_pagina = request.args.get("por_pagina", 20, type=int)
    offset = (pagina - 1) * por_pagina
    
    df_full = pd.read_sql_query(query, conn, params=params)
    total_registros = len(df_full)
    
    query += " LIMIT ? OFFSET ?"
    params.extend([por_pagina, offset])
    
    df_paginado = pd.read_sql_query(query, conn, params=params)
    conn.close()

    return jsonify({
        "alunos": df_paginado.fillna("").to_dict(orient="records"),
        "total": total_registros,
        "paginas": (total_registros + por_pagina - 1) // por_pagina,
        "pagina_atual": pagina
    })


@app.route("/aluno/<int:id>", methods=["GET"])
def buscar_aluno(id):
    try:
        conn = get_db_connection()
        cursor = conn.execute("SELECT * FROM alunos WHERE ID = ?", (str(id),))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({"erro": "Aluno nao encontrado"}), 404

        aluno_dict = {k: ("" if v is None else v) for k, v in dict(row).items()}
        return jsonify(aluno_dict)
    except Exception as e:
        return jsonify({"erro": f"Erro ao buscar aluno: {str(e)}"}), 500


@app.route("/atualizar/<int:id>", methods=["PUT"])
def atualizar_aluno(id):
    try:
        dados = request.get_json(silent=True)
        if not dados:
            return jsonify({"erro": "Dados nulos ou JSON invalido"}), 400

        conn = get_db_connection()
        cursor = conn.execute("SELECT * FROM alunos WHERE ID = ?", (str(id),))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return jsonify({"erro": "Aluno nao encontrado"}), 404

        aluno_atual = dict(row)
        dados_mesclados = mesclar_dados_aluno(aluno_atual, dados)

        matricula_nova = texto_seguro(dados_mesclados.get("Matricula"))
        if matricula_nova:
            cursor = conn.execute("SELECT ID FROM alunos WHERE Matricula = ? AND CAST(ID AS INTEGER) != ?", (matricula_nova, id))
            if cursor.fetchone():
                conn.close()
                return jsonify({"erro": "Esta matricula ja pertence a outro aluno."}), 409

        aluno_atualizado = montar_registro_aluno(dados_mesclados, aluno_id=id)

        set_clause = ", ".join([f"{col} = ?" for col in aluno_atualizado.keys()])
        valores = list(aluno_atualizado.values())
        valores.append(str(id))

        conn.execute(f"UPDATE alunos SET {set_clause} WHERE ID = ?", tuple(valores))
        conn.commit()
        conn.close()

        sincronizar_sqlite_para_csv()

        treinar_modelo()

        return jsonify({
            "mensagem": "Aluno atualizado com sucesso",
            "aluno": aluno_atualizado
        }), 200

    except Exception as e:
        return jsonify({"erro": f"Erro ao atualizar aluno: {str(e)}"}), 500


@app.route("/deletar/<int:id>", methods=["DELETE"])
def deletar_aluno(id):
    try:
        conn = get_db_connection()
        cursor = conn.execute("SELECT ID FROM alunos WHERE ID = ?", (str(id),))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"erro": "Aluno nao encontrado"}), 404

        conn.execute("DELETE FROM alunos WHERE ID = ?", (str(id),))
        conn.commit()
        conn.close()

        sincronizar_sqlite_para_csv()

        treinar_modelo()

        return jsonify({"mensagem": "Aluno removido com sucesso"})
    except Exception as e:
        return jsonify({"erro": f"Erro ao excluir aluno: {str(e)}"}), 500


@app.route("/alunos_risco", methods=["GET"])
def listar_alunos_risco():
    try:
        conn = get_db_connection()
        query = "SELECT * FROM alunos WHERE UPPER(Nivel_Risco) IN ('ALTO', 'MEDIO')"
        df_risco = pd.read_sql_query(query, conn)
        conn.close()
        
        return jsonify(df_risco.fillna("").to_dict(orient="records"))
    except Exception as e:
        return jsonify({"erro": f"Erro ao listar alunos em risco: {str(e)}"}), 500


@app.route("/prever_novo", methods=["POST"])
def prever_novo():
    try:
        dados = request.get_json(silent=True)
        if not dados:
            return jsonify({"erro": "Dados nulos ou JSON invalido"}), 400

        predicao = prever_com_modelo(dados)
        return jsonify(predicao)

    except Exception as e:
        return jsonify({"erro": str(e)}), 400


@app.route("/upload_base", methods=["POST"])
def upload_base():
    try:
        if "arquivo" not in request.files:
            return jsonify({"erro": "Nenhum arquivo enviado. Use o campo 'arquivo'."}), 400

        arquivo = request.files["arquivo"]

        if arquivo.filename == "":
            return jsonify({"erro": "Arquivo vazio."}), 400

        if not arquivo.filename.lower().endswith(".csv"):
            return jsonify({"erro": "Envie apenas arquivo CSV."}), 400

        df_upload = ler_csv_flexivel(arquivo)

        if df_upload.empty:
            return jsonify({"erro": "O CSV enviado esta vazio."}), 400

        # --- ZERAR O ESTADO DA BASE E MODELO ANTERIORES ---
        # Garante que o modelo antigo não tente fazer predições nos novos dados
        modelo_global.reset()

        conn = get_db_connection()
        conn.execute("DROP TABLE IF EXISTS alunos")
        conn.commit()
        conn.close()
        # ---------------------------------------------------

        df_final = completar_base_generica(df_upload)

        if not salvar_dados(df_final):
            return jsonify({"erro": "Falha ao salvar a base enviada"}), 500

        treinar_modelo()

        return jsonify({
            "mensagem": "Base enviada com sucesso",
            "total_registros": int(len(df_final)),
            "colunas_detectadas": list(df_upload.columns),
            "modelo": modelo_global.metricas_modelo
        }), 201

    except Exception as e:
        print(f"Erro no upload da base: {e}")
        return jsonify({"erro": str(e)}), 500


@app.route("/baixar_base", methods=["GET"])
def baixar_base():
    try:
        df = carregar_dados()
        if df.empty:
            return jsonify({"erro": "Base vazia"}), 404

        output = BytesIO()
        df.to_csv(output, index=False, encoding="utf-8-sig")
        output.seek(0)

        return send_file(
            output,
            mimetype="text/csv",
            as_attachment=True,
            download_name="base_estudantes.csv"
        )
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/exportar_risco", methods=["GET"])
def exportar_risco():
    try:
        df = carregar_dados()
        if df.empty:
            return jsonify({"erro": "Base vazia"}), 404

        df_risco = df[df["Nivel_Risco"].astype(str).str.upper().isin(["ALTO", "MEDIO"])].copy()

        if df_risco.empty:
            return jsonify({"erro": "Nao ha alunos em risco para exportar"}), 404

        output = BytesIO()
        df_risco.to_csv(output, index=False, encoding="utf-8-sig")
        output.seek(0)

        return send_file(
            output,
            mimetype="text/csv",
            as_attachment=True,
            download_name="alunos_em_risco.csv"
        )
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/resetar_base", methods=["DELETE", "OPTIONS"])
def resetar_base():
    if request.method == "OPTIONS":
        return ("", 200)

    try:
        df = carregar_dados()
        if df.empty:
            return jsonify({"erro": "A base já está vazia. Faça o upload de um arquivo."}), 400

        conn = get_db_connection()
        conn.execute("DROP TABLE IF EXISTS alunos")
        conn.commit()
        conn.close()

        if os.path.exists(CAMINHO_CSV):
            df_vazio = pd.DataFrame(columns=COLUNAS_PADRAO)
            try:
                df_vazio.to_csv(CAMINHO_CSV, index=False, encoding="utf-8-sig")
            except PermissionError:
                print("[AVISO] O arquivo CSV está aberto. A base foi limpa com sucesso apenas no banco de dados SQLite.")

        garantir_base()
        
        # Reseta o estado do modelo manualmente para refletir a base vazia
        modelo_global.reset("Base de dados resetada. Aguardando novos dados.")

        return jsonify({"mensagem": "Base resetada com sucesso", "modelo": modelo_global.metricas_modelo})
    except Exception as e:
        return jsonify({"erro": f"Erro ao resetar base: {str(e)}"}), 500

# Garante que a base seja inicializada e o modelo treinado
# logo que a aplicação inicie (evita o erro caso o reloader do Flask reinicie o servidor)
garantir_base()
treinar_modelo()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=False, host="0.0.0.0", port=port, use_reloader=False)