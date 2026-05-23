//[Descreve parametros temporais usados por cada camada visual do efeito glitch.]
export type GlitchGlyphProfile = {
  upperDelay: number;
  upperDuration: number;
  lowerDelay: number;
  lowerDuration: number;
  noiseADelay: number;
  noiseADuration: number;
  noiseBDelay: number;
  noiseBDuration: number;
};

//[Agrupa caractere renderizado com indice global e perfil visual escolhido deterministicamente.]
export type GlitchGlyph = {
  glyph: string;
  index: number;
  profile: GlitchGlyphProfile;
};

//[Representa palavra quebrada em glyphs para composicao animada no template Astro.]
export type GlitchWord = {
  glyphs: GlitchGlyph[];
};

//[Mantem biblioteca finita de perfis para repetir animacoes sem gerar aleatoriedade em runtime.]
const glyphProfiles: GlitchGlyphProfile[] = [
  { upperDelay: -0.58, upperDuration: 2.65, lowerDelay: -2.31, lowerDuration: 4.1, noiseADelay: -1.12, noiseADuration: 2.25, noiseBDelay: -3.44, noiseBDuration: 3.95 },
  { upperDelay: -2.07, upperDuration: 3.38, lowerDelay: -0.84, lowerDuration: 2.95, noiseADelay: -3.62, noiseADuration: 4.3, noiseBDelay: -0.28, noiseBDuration: 2.45 },
  { upperDelay: -1.34, upperDuration: 2.92, lowerDelay: -3.76, lowerDuration: 4.55, noiseADelay: -0.46, noiseADuration: 2.72, noiseBDelay: -2.18, noiseBDuration: 3.28 },
  { upperDelay: -3.18, upperDuration: 4.18, lowerDelay: -1.42, lowerDuration: 3.22, noiseADelay: -2.86, noiseADuration: 3.78, noiseBDelay: -4.07, noiseBDuration: 4.62 },
  { upperDelay: -0.91, upperDuration: 2.44, lowerDelay: -2.88, lowerDuration: 3.86, noiseADelay: -4.24, noiseADuration: 4.52, noiseBDelay: -1.36, noiseBDuration: 2.58 },
  { upperDelay: -2.79, upperDuration: 3.71, lowerDelay: -0.33, lowerDuration: 2.68, noiseADelay: -1.94, noiseADuration: 3.16, noiseBDelay: -3.52, noiseBDuration: 4.08 },
  { upperDelay: -1.67, upperDuration: 2.83, lowerDelay: -4.15, lowerDuration: 4.44, noiseADelay: -0.74, noiseADuration: 2.34, noiseBDelay: -2.61, noiseBDuration: 3.74 },
  { upperDelay: -3.49, upperDuration: 4.36, lowerDelay: -1.07, lowerDuration: 3.04, noiseADelay: -2.42, noiseADuration: 3.48, noiseBDelay: -0.59, noiseBDuration: 2.86 },
  { upperDelay: -0.26, upperDuration: 2.58, lowerDelay: -2.54, lowerDuration: 3.94, noiseADelay: -3.17, noiseADuration: 4.11, noiseBDelay: -1.83, noiseBDuration: 3.06 },
  { upperDelay: -2.53, upperDuration: 3.96, lowerDelay: -0.62, lowerDuration: 2.78, noiseADelay: -4.31, noiseADuration: 4.66, noiseBDelay: -2.07, noiseBDuration: 3.52 },
  { upperDelay: -1.03, upperDuration: 2.71, lowerDelay: -3.28, lowerDuration: 4.26, noiseADelay: -0.39, noiseADuration: 2.48, noiseBDelay: -3.78, noiseBDuration: 4.27 },
  { upperDelay: -3.84, upperDuration: 4.52, lowerDelay: -1.59, lowerDuration: 3.35, noiseADelay: -2.21, noiseADuration: 3.69, noiseBDelay: -0.96, noiseBDuration: 2.77 },
  { upperDelay: -0.71, upperDuration: 2.39, lowerDelay: -2.96, lowerDuration: 4.02, noiseADelay: -3.56, noiseADuration: 4.24, noiseBDelay: -1.48, noiseBDuration: 3.18 }
];

//[Converte palavras em glyphs indexados, preservando ordem global para animacao visual consistente.]
export function buildGlitchWordmark(words: string[]): GlitchWord[] {
  let offset = 0;

  return words.map((word) => {
    const glyphs = word.split("").map((glyph, glyphIndex) => {
      const index = offset + glyphIndex;

      return {
        glyph,
        index,
        profile: glyphProfiles[index % glyphProfiles.length]
      };
    });

    offset += word.length;

    return { glyphs };
  });
}
