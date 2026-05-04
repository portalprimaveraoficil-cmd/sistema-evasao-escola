import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

class EvasaoModel:
    def __init__(self):
        self.reset()

    def treinar(self, df, colunas_excluidas, fn_normalizar_dropout, fn_preparar_features):
        if df.empty:
            self.reset("Base vazia. Modelo nao treinado.")
            return False

        df_modelo = df.copy()
        df_modelo["Dropout"] = df_modelo["Dropout"].apply(fn_normalizar_dropout)

        X = fn_preparar_features(df_modelo)
        y = df_modelo["Dropout"]

        if len(X) < 10 or y.nunique() < 2:
            self.metricas_modelo.update({
                "treinado": False,
                "amostras": int(len(X)),
                "classes": int(y.nunique()),
                "total_features": int(X.shape[1]) if not X.empty else 0,
                "mensagem": "Base insuficiente para treino."
            })
            return False

        stratify_param = y if y.value_counts().min() > 1 else None
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=stratify_param
        )

        pipeline = Pipeline([
            ("scaler", StandardScaler(with_mean=False)),
            ("clf", HistGradientBoostingClassifier(
                max_iter=100, learning_rate=0.1, max_depth=5, random_state=42
            ))
        ])

        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)

        self.modelo_ia = pipeline
        self.modelo_ativo = True
        self.colunas_modelo_treinadas = list(X.columns)

        self.metricas_modelo.update({
            "treinado": True,
            "acuracia": round(float(accuracy_score(y_test, y_pred)), 4),
            "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
            "f1_score": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
            "amostras": int(len(X)),
            "classes": int(y.nunique()),
            "total_features": int(X.shape[1]),
            "mensagem": "Modelo Gradient Boosting (HGB) treinado com sucesso"
        })
        return True

    def prever(self, entrada_df, fn_gerar_recomendacoes, fn_preparar_features, fn_converter_nivel):
        gpa = float(entrada_df.iloc[0]["GPA"])
        freq = float(entrada_df.iloc[0]["Attendance_Rate"])
        stress = int(entrada_df.iloc[0]["Stress_Index"])
        study_hours = float(entrada_df.iloc[0]["Study_Hours_per_Day"])
        travel_time = float(entrada_df.iloc[0]["Travel_Time_Minutes"])

        recomendacoes = fn_gerar_recomendacoes(gpa, freq, stress, study_hours, travel_time)

        if self.modelo_ativo and self.modelo_ia is not None and self.colunas_modelo_treinadas:
            entrada_expandida = fn_preparar_features(
                entrada_df, ajustar_colunas=True, colunas_referencia=self.colunas_modelo_treinadas
            )

            pred = int(self.modelo_ia.predict(entrada_expandida.to_numpy())[0])
            proba = self.modelo_ia.predict_proba(entrada_expandida.to_numpy())[0]
            classes = list(self.modelo_ia.named_steps["clf"].classes_)

            probabilidade_risco = float(proba[classes.index(1)]) * 100 if 1 in classes else 0.0
            nivel_risco = fn_converter_nivel(probabilidade_risco)

            return {
                "dropout": pred,
                "nivel_risco": nivel_risco,
                "probabilidade": round(probabilidade_risco, 2),
                "recomendacoes": recomendacoes,
                "origem_modelo": "Gradient Boosting (HGB)",
                "mensagem": "Analise concluida com sucesso"
            }

        return {
            "dropout": 0,
            "nivel_risco": "NÃO ANALISADO",
            "probabilidade": 0.0,
            "recomendacoes": "IA não treinada. Carregue uma base válida antes de analisar.",
            "origem_modelo": "IA_INATIVA",
            "mensagem": "Aviso: Modelo de IA nao treinado. Por favor, carregue dados e treine o modelo."
        }

    def reset(self, msg="Modelo ainda nao treinado"):
        self.modelo_ia = None
        self.modelo_ativo = False
        self.colunas_modelo_treinadas = []
        self.metricas_modelo = {
            "treinado": False,
            "acuracia": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1_score": 0.0,
            "amostras": 0,
            "classes": 0,
            "total_features": 0,
            "mensagem": msg
        }

# Instância global do modelo para o app
modelo_global = EvasaoModel()