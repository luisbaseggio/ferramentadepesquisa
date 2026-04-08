function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function resolveEditorialVoice(niche = "inovacao") {
  const normalized = normalizeText(niche);

  if (includesAny(normalized, ["branding", "marca", "posicionamento"])) {
    return {
      id: "branding",
      label: "branding",
      centralQuestion: "que leitura de marca, linguagem ou percepção esse caso reorganiza?",
      implicationFrame: "Para quem acompanha branding, o valor está em perceber como o caso muda leitura, símbolo, desejo e legitimidade.",
      thesisFrame: "A leitura forte aqui não é só de mercado. É de marca, linguagem e percepção social.",
      closingFrame: "O ponto final precisa mostrar como o caso reconfigura desejo, leitura pública e valor simbólico.",
      markerLine: "É assim que marcas ganham espaço cultural antes de ganhar mercado."
    };
  }

  if (includesAny(normalized, ["politica", "política", "publico", "público", "governo"])) {
    return {
      id: "politica",
      label: "política",
      centralQuestion: "que disputa de poder, narrativa ou legitimidade esse caso revela?",
      implicationFrame: "Para quem acompanha política, o valor está em perceber como narrativa, escala e autoridade estão sendo reorganizadas.",
      thesisFrame: "A leitura forte aqui não é só institucional. É de poder narrativo, operação e legitimidade pública.",
      closingFrame: "O ponto final precisa mostrar como o caso muda a disputa por autoridade, influência e capacidade de organizar percepção.",
      markerLine: "É assim que poder ganha escala antes de virar consenso."
    };
  }

  if (includesAny(normalized, ["comportamento", "cultura", "audiencia", "audiência", "consumo"])) {
    return {
      id: "comportamento",
      label: "comportamento",
      centralQuestion: "que mudança de hábito, símbolo ou sensibilidade esse caso revela?",
      implicationFrame: "Para quem acompanha comportamento, o valor está em nomear cedo o que está mudando em hábito, desejo e leitura cultural.",
      thesisFrame: "A leitura forte aqui não é só de produto. É de sensibilidade, hábito e mudança cultural.",
      closingFrame: "O ponto final precisa mostrar como o caso antecipa uma nova forma de desejar, pertencer ou interpretar o cotidiano.",
      markerLine: "É assim que comportamento muda antes de parecer regra."
    };
  }

  if (includesAny(normalized, ["mercado", "negocio", "negócio", "varejo", "economia"])) {
    return {
      id: "mercado",
      label: "mercado",
      centralQuestion: "que mudança de regra, margem ou redistribuição de vantagem esse caso revela?",
      implicationFrame: "Para quem acompanha mercado, o valor está em perceber onde margem, escala e poder de barganha estão mudando de lado.",
      thesisFrame: "A leitura forte aqui não é só de tendência. É de regra competitiva, captura de valor e redistribuição de vantagem.",
      closingFrame: "O ponto final precisa mostrar como o caso muda o jogo de margem, dependência, escala ou defesa competitiva.",
      markerLine: "É assim que mercado muda antes da maioria ajustar posição."
    };
  }

  return {
    id: "inovacao",
    label: "inovação",
    centralQuestion: "que mudança estrutural esse caso revela sobre vantagem, adoção ou infraestrutura?",
    implicationFrame: "Para quem acompanha inovação, o valor está em perceber cedo o mecanismo que muda vantagem, regra ou comportamento.",
    thesisFrame: "A leitura forte aqui não é só de tecnologia. É de mudança estrutural em produto, distribuição, poder ou infraestrutura.",
    closingFrame: "O ponto final precisa mostrar como o caso antecipa a próxima vantagem em inovação.",
    markerLine: "É assim que inovação ganha espaço no mundo."
  };
}
