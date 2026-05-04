import sqlite3
import pandas as pd

def get_db_connection(caminho_db):
    """Retorna a conexão com o banco SQLite."""
    conn = sqlite3.connect(caminho_db)
    conn.row_factory = sqlite3.Row
    return conn

def carregar_dados(caminho_db, colunas_padrao):
    """Carrega os dados do SQLite e retorna um DataFrame do Pandas."""
    try:
        conn = get_db_connection(caminho_db)
        df = pd.read_sql_query("SELECT * FROM alunos", conn)
        conn.close()
        return df
    except Exception as e:
        print(f"[ERRO] Ao carregar dados do banco: {e}")
        return pd.DataFrame(columns=colunas_padrao)