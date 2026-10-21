
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_rate_limits": {
                  Row: {
                    "contador": number,"janela": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contador"?: number,"janela": string,"user_id": string
                  }
                  Update: {
                    "contador"?: number,"janela"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_rate_limits_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"anexos": {
                  Row: {
                    "aposta_id": string,"created_at": string,"id": string,"mime": string,"storage_path": string,"tamanho_bytes": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aposta_id": string,"created_at"?: string,"id"?: string,"mime": string,"storage_path": string,"tamanho_bytes": number,"user_id"?: string
                  }
                  Update: {
                    "aposta_id"?: string,"created_at"?: string,"id"?: string,"mime"?: string,"storage_path"?: string,"tamanho_bytes"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "anexos_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "apostas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "anexos_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "vw_apostas_resumo"
      referencedColumns: ["id"]
    }
                  ]
                },"aposta_concursos": {
                  Row: {
                    "aposta_id": string,"modalidade_id": number,"numero_concurso": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aposta_id": string,"modalidade_id": number,"numero_concurso": number,"user_id"?: string
                  }
                  Update: {
                    "aposta_id"?: string,"modalidade_id"?: number,"numero_concurso"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "aposta_concursos_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "apostas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aposta_concursos_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "vw_apostas_resumo"
      referencedColumns: ["id"]
    }
                  ]
                },"aposta_jogos": {
                  Row: {
                    "aposta_id": string,"dezenas": (number)[],"id": string,"ordem": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aposta_id": string,"dezenas": (number)[],"id"?: string,"ordem": number,"user_id"?: string
                  }
                  Update: {
                    "aposta_id"?: string,"dezenas"?: (number)[],"id"?: string,"ordem"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "aposta_jogos_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "apostas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aposta_jogos_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "vw_apostas_resumo"
      referencedColumns: ["id"]
    }
                  ]
                },"apostas": {
                  Row: {
                    "bolao_cotas_usuario": number | null,"bolao_numero_cota": number | null,"bolao_total_cotas": number | null,"comprovante_hash": string | null,"concurso_inicial": number,"created_at": string,"data_aposta": string,"id": string,"local_compra": string | null,"modalidade_id": number,"observacao": string | null,"origem": Database["public"]['Enums']["origem_aposta"],"qtd_concursos": number,"status": Database["public"]['Enums']["status_aposta"],"tarifa_centavos": number,"tipo": Database["public"]['Enums']["tipo_aposta"],"updated_at": string,"user_id": string,"valor_cota_centavos": number | null,"valor_pago_centavos": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bolao_cotas_usuario"?: number | null,"bolao_numero_cota"?: number | null,"bolao_total_cotas"?: number | null,"comprovante_hash"?: string | null,"concurso_inicial": number,"created_at"?: string,"data_aposta": string,"id"?: string,"local_compra"?: string | null,"modalidade_id": number,"observacao"?: string | null,"origem"?: Database["public"]['Enums']["origem_aposta"],"qtd_concursos"?: number,"status"?: Database["public"]['Enums']["status_aposta"],"tarifa_centavos"?: number,"tipo": Database["public"]['Enums']["tipo_aposta"],"updated_at"?: string,"user_id"?: string,"valor_cota_centavos"?: number | null,"valor_pago_centavos": number
                  }
                  Update: {
                    "bolao_cotas_usuario"?: number | null,"bolao_numero_cota"?: number | null,"bolao_total_cotas"?: number | null,"comprovante_hash"?: string | null,"concurso_inicial"?: number,"created_at"?: string,"data_aposta"?: string,"id"?: string,"local_compra"?: string | null,"modalidade_id"?: number,"observacao"?: string | null,"origem"?: Database["public"]['Enums']["origem_aposta"],"qtd_concursos"?: number,"status"?: Database["public"]['Enums']["status_aposta"],"tarifa_centavos"?: number,"tipo"?: Database["public"]['Enums']["tipo_aposta"],"updated_at"?: string,"user_id"?: string,"valor_cota_centavos"?: number | null,"valor_pago_centavos"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "apostas_modalidade_id_fkey"
      columns: ["modalidade_id"]
isOneToOne: false
      referencedRelation: "modalidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "apostas_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"concursos": {
                  Row: {
                    "acumulado": boolean | null,"data_proximo": string | null,"data_sorteio": string,"dezenas": (number)[] | null,"fonte": string,"id": number,"modalidade_id": number,"numero": number,"rateio": Json | null,"sincronizado_em": string | null,"valor_estimado_proximo_centavos": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acumulado"?: boolean | null,"data_proximo"?: string | null,"data_sorteio": string,"dezenas"?: (number)[] | null,"fonte"?: string,"id"?: number,"modalidade_id": number,"numero": number,"rateio"?: Json | null,"sincronizado_em"?: string | null,"valor_estimado_proximo_centavos"?: number | null
                  }
                  Update: {
                    "acumulado"?: boolean | null,"data_proximo"?: string | null,"data_sorteio"?: string,"dezenas"?: (number)[] | null,"fonte"?: string,"id"?: number,"modalidade_id"?: number,"numero"?: number,"rateio"?: Json | null,"sincronizado_em"?: string | null,"valor_estimado_proximo_centavos"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "concursos_modalidade_id_fkey"
      columns: ["modalidade_id"]
isOneToOne: false
      referencedRelation: "modalidades"
      referencedColumns: ["id"]
    }
                  ]
                },"conferencias": {
                  Row: {
                    "acertos": number,"aposta_id": string,"aposta_jogo_id": string,"concurso_id": number,"conferido_em": string,"dezenas_acertadas": (number)[],"premios_por_faixa": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acertos": number,"aposta_id": string,"aposta_jogo_id": string,"concurso_id": number,"conferido_em"?: string,"dezenas_acertadas": (number)[],"premios_por_faixa": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "acertos"?: number,"aposta_id"?: string,"aposta_jogo_id"?: string,"concurso_id"?: number,"conferido_em"?: string,"dezenas_acertadas"?: (number)[],"premios_por_faixa"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conferencias_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "apostas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conferencias_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "vw_apostas_resumo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conferencias_aposta_jogo_id_fkey"
      columns: ["aposta_jogo_id"]
isOneToOne: false
      referencedRelation: "aposta_jogos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conferencias_concurso_id_fkey"
      columns: ["concurso_id"]
isOneToOne: false
      referencedRelation: "concursos"
      referencedColumns: ["id"]
    }
                  ]
                },"configuracoes": {
                  Row: {
                    "aliquota_ir_bps": number,"base_calculo_ir": string,"id": number,"limite_isencao_ir_centavos": number,"prazo_resgate_dias": number,"updated_at": string,"valor_rateio_api_eh": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aliquota_ir_bps"?: number,"base_calculo_ir"?: string,"id"?: number,"limite_isencao_ir_centavos"?: number,"prazo_resgate_dias"?: number,"updated_at"?: string,"valor_rateio_api_eh"?: string
                  }
                  Update: {
                    "aliquota_ir_bps"?: number,"base_calculo_ir"?: string,"id"?: number,"limite_isencao_ir_centavos"?: number,"prazo_resgate_dias"?: number,"updated_at"?: string,"valor_rateio_api_eh"?: string
                  }
                  Relationships: [
                    
                  ]
                },"modalidade_precos": {
                  Row: {
                    "id": number,"modalidade_id": number,"preco_simples_centavos": number,"vigente_desde": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"modalidade_id": number,"preco_simples_centavos": number,"vigente_desde": string
                  }
                  Update: {
                    "id"?: number,"modalidade_id"?: number,"preco_simples_centavos"?: number,"vigente_desde"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modalidade_precos_modalidade_id_fkey"
      columns: ["modalidade_id"]
isOneToOne: false
      referencedRelation: "modalidades"
      referencedColumns: ["id"]
    }
                  ]
                },"modalidades": {
                  Row: {
                    "ativa": boolean,"base_aposta": number,"bolao_max_cotas": number | null,"bolao_min_cotas": number | null,"cor_hex": string | null,"faixas": NonNullable<Json>,"id": number,"max_marcadas": number,"min_marcadas": number,"nome": string,"qtd_sorteadas": number,"slug": string,"teimosinha_concursos": (number)[] | null,"universo_max": number,"universo_min": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativa"?: boolean,"base_aposta": number,"bolao_max_cotas"?: number | null,"bolao_min_cotas"?: number | null,"cor_hex"?: string | null,"faixas": NonNullable<Json>,"id"?: number,"max_marcadas": number,"min_marcadas": number,"nome": string,"qtd_sorteadas": number,"slug": string,"teimosinha_concursos"?: (number)[] | null,"universo_max": number,"universo_min": number
                  }
                  Update: {
                    "ativa"?: boolean,"base_aposta"?: number,"bolao_max_cotas"?: number | null,"bolao_min_cotas"?: number | null,"cor_hex"?: string | null,"faixas"?: NonNullable<Json>,"id"?: number,"max_marcadas"?: number,"min_marcadas"?: number,"nome"?: string,"qtd_sorteadas"?: number,"slug"?: string,"teimosinha_concursos"?: (number)[] | null,"universo_max"?: number,"universo_min"?: number
                  }
                  Relationships: [
                    
                  ]
                },"notificacoes": {
                  Row: {
                    "chave_dedup": string | null,"corpo": string | null,"created_at": string,"id": string,"lida_em": string | null,"link": string | null,"tipo": Database["public"]['Enums']["tipo_notificacao"],"titulo": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_dedup"?: string | null,"corpo"?: string | null,"created_at"?: string,"id"?: string,"lida_em"?: string | null,"link"?: string | null,"tipo": Database["public"]['Enums']["tipo_notificacao"],"titulo": string,"user_id": string
                  }
                  Update: {
                    "chave_dedup"?: string | null,"corpo"?: string | null,"created_at"?: string,"id"?: string,"lida_em"?: string | null,"link"?: string | null,"tipo"?: Database["public"]['Enums']["tipo_notificacao"],"titulo"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notificacoes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"participantes": {
                  Row: {
                    "aposta_id": string,"contribuicao_centavos": number | null,"eh_usuario": boolean,"id": string,"nome": string,"ordem": number,"peso": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aposta_id": string,"contribuicao_centavos"?: number | null,"eh_usuario"?: boolean,"id"?: string,"nome": string,"ordem"?: number,"peso"?: number,"user_id"?: string
                  }
                  Update: {
                    "aposta_id"?: string,"contribuicao_centavos"?: number | null,"eh_usuario"?: boolean,"id"?: string,"nome"?: string,"ordem"?: number,"peso"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participantes_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "apostas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participantes_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "vw_apostas_resumo"
      referencedColumns: ["id"]
    }
                  ]
                },"premio_divisoes": {
                  Row: {
                    "liquido_centavos": number,"participante_id": string,"premio_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "liquido_centavos": number,"participante_id": string,"premio_id": string,"user_id": string
                  }
                  Update: {
                    "liquido_centavos"?: number,"participante_id"?: string,"premio_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "premio_divisoes_participante_id_fkey"
      columns: ["participante_id"]
isOneToOne: false
      referencedRelation: "participantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "premio_divisoes_premio_id_fkey"
      columns: ["premio_id"]
isOneToOne: false
      referencedRelation: "premios"
      referencedColumns: ["id"]
    }
                  ]
                },"premios": {
                  Row: {
                    "aposta_id": string,"bruto_aposta_centavos": number,"bruto_usuario_centavos": number,"concurso_id": number,"created_at": string,"faixas_sem_valor": (number)[],"id": string,"ir_usuario_centavos": number,"liquido_usuario_centavos": number,"prazo_resgate": string,"regra_ir": NonNullable<Json>,"resgatado_em": string | null,"status": Database["public"]['Enums']["status_premio"],"updated_at": string,"user_id": string,"valor_informado_manual": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "aposta_id": string,"bruto_aposta_centavos": number,"bruto_usuario_centavos": number,"concurso_id": number,"created_at"?: string,"faixas_sem_valor"?: (number)[],"id"?: string,"ir_usuario_centavos": number,"liquido_usuario_centavos": number,"prazo_resgate": string,"regra_ir": NonNullable<Json>,"resgatado_em"?: string | null,"status"?: Database["public"]['Enums']["status_premio"],"updated_at"?: string,"user_id"?: string,"valor_informado_manual"?: boolean
                  }
                  Update: {
                    "aposta_id"?: string,"bruto_aposta_centavos"?: number,"bruto_usuario_centavos"?: number,"concurso_id"?: number,"created_at"?: string,"faixas_sem_valor"?: (number)[],"id"?: string,"ir_usuario_centavos"?: number,"liquido_usuario_centavos"?: number,"prazo_resgate"?: string,"regra_ir"?: NonNullable<Json>,"resgatado_em"?: string | null,"status"?: Database["public"]['Enums']["status_premio"],"updated_at"?: string,"user_id"?: string,"valor_informado_manual"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "premios_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "apostas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "premios_aposta_id_fkey"
      columns: ["aposta_id"]
isOneToOne: false
      referencedRelation: "vw_apostas_resumo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "premios_concurso_id_fkey"
      columns: ["concurso_id"]
isOneToOne: false
      referencedRelation: "concursos"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "ativo": boolean,"created_at": string,"id": string,"nome": string,"papel": Database["public"]['Enums']["papel_usuario"],"preferencias": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"created_at"?: string,"id": string,"nome": string,"papel"?: Database["public"]['Enums']["papel_usuario"],"preferencias"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"created_at"?: string,"id"?: string,"nome"?: string,"papel"?: Database["public"]['Enums']["papel_usuario"],"preferencias"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sync_logs": {
                  Row: {
                    "conferidos": number,"executado_em": string,"id": number,"inseridos": number,"mensagem": string | null,"modalidade_id": number | null,"origem": string,"status": string,"ultimo_concurso": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "conferidos"?: number,"executado_em"?: string,"id"?: number,"inseridos"?: number,"mensagem"?: string | null,"modalidade_id"?: number | null,"origem": string,"status": string,"ultimo_concurso"?: number | null
                  }
                  Update: {
                    "conferidos"?: number,"executado_em"?: string,"id"?: number,"inseridos"?: number,"mensagem"?: string | null,"modalidade_id"?: number | null,"origem"?: string,"status"?: string,"ultimo_concurso"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_logs_modalidade_id_fkey"
      columns: ["modalidade_id"]
isOneToOne: false
      referencedRelation: "modalidades"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "vw_apostas_resumo": {
                  Row: {
                    "bolao_cotas_usuario": number | null,"bolao_numero_cota": number | null,"bolao_total_cotas": number | null,"comprovante_hash": string | null,"concurso_final": number | null,"concurso_inicial": number | null,"concursos_conferidos": number | null,"created_at": string | null,"data_aposta": string | null,"gasto_usuario_centavos": number | null,"id": string | null,"local_compra": string | null,"max_dezenas": number | null,"melhor_acerto": number | null,"modalidade_cor": string | null,"modalidade_id": number | null,"modalidade_nome": string | null,"modalidade_slug": string | null,"observacao": string | null,"origem": Database["public"]['Enums']["origem_aposta"] | null,"premio_a_resgatar": boolean | null,"premio_bruto_usuario_centavos": number | null,"premio_liquido_usuario_centavos": number | null,"premio_valor_pendente": boolean | null,"qtd_concursos": number | null,"qtd_jogos": number | null,"qtd_participantes": number | null,"qtd_premios": number | null,"recuperado_usuario_centavos": number | null,"saldo_centavos": number | null,"status": Database["public"]['Enums']["status_aposta"] | null,"tarifa_centavos": number | null,"tipo": Database["public"]['Enums']["tipo_aposta"] | null,"updated_at": string | null,"user_id": string | null,"valor_cota_centavos": number | null,"valor_pago_centavos": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "apostas_modalidade_id_fkey"
      columns: ["modalidade_id"]
isOneToOne: false
      referencedRelation: "modalidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "apostas_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "aal2":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"eh_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"eh_ativo":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"fn_admin_listar_usuarios":
{ Args: Record<PropertyKey, never>; Returns: {
              "ativo": boolean,"created_at": string,"email": string,"id": string,"nome": string,"papel": Database["public"]['Enums']["papel_usuario"],"ultimo_acesso": string
            }[]
                           },
"fn_limpar_conferencia":
{ Args: { "p_aposta_id": string }; Returns: undefined
                           },
"fn_marcar_resgatado":
{ Args: { "p_premio_id": string,"p_resgatado": boolean }; Returns: undefined
                           },
"fn_preco_vigente":
{ Args: { "p_data": string,"p_modalidade_id": number }; Returns: number
                           },
"fn_processar_prazos":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"fn_registrar_chamada_admin":
{ Args: { "p_limite"?: number,"p_user_id": string }; Returns: boolean
                           },
"fn_revogar_sessoes":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"salvar_aposta":
{ Args: { "p_aposta": Json,"p_id"?: string }; Returns: string
                           }
          }
          Enums: {
            "origem_aposta": "manual"|"excel"|"pdf","papel_usuario": "admin"|"membro","status_aposta": "aguardando"|"conferida"|"premiada"|"nao_premiada"|"cancelada","status_premio": "a_resgatar"|"resgatado"|"expirado","tipo_aposta": "simples"|"bolao"|"teimosinha","tipo_notificacao": "resultado"|"premio"|"premio_expirando"|"orcamento"|"sistema"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "origem_aposta": ["manual", "excel", "pdf"],"papel_usuario": ["admin", "membro"],"status_aposta": ["aguardando", "conferida", "premiada", "nao_premiada", "cancelada"],"status_premio": ["a_resgatar", "resgatado", "expirado"],"tipo_aposta": ["simples", "bolao", "teimosinha"],"tipo_notificacao": ["resultado", "premio", "premio_expirando", "orcamento", "sistema"]
          }
        }
} as const
