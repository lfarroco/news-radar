

import axios from  'axios';
import cheerio from 'cheerio';

const url = 'https://news.ycombinator.com/';


axios(url).then(response => {


    const html = response.data;
    const $ = cheerio.load(html);
    const items = $('.athing');

    const scores = $('.subline .score');

    const out = []

    let i = 0;
    items.each(function(){

     const title = $(this).find('.titleline').text();

     const url = $(this).find('.titleline a').attr("href");

     out[i] = [,title,url]

     i++;

    })

    let j = 0;
    scores.each(function(){

     const score = $(this).text();

     out[j][0] = score 

     j++;

    })


    console.log(out)

    // items.each(function(){
    //     const nomeJogador = $(this).find('.jogador-nome').text();
    //     const posicaoJogador = $(this).find('.jogador-posicao').text();
    //     const numeroGols = $(this).find('.jogador-gols').text();
    //     const timeJogador = $(this).find('.jogador-escudo > img').attr('alt');
    //     tabelaJogador.push({
    //         nomeJogador,
    //         posicaoJogador,
    //         numeroGols,
    //         timeJogador
    //     });
    // });
    // console.log(tabelaJogador);


}).catch(console.error);
