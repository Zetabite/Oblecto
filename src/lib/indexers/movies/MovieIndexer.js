import AggregateIdentifier from '../../common/AggregateIdentifier';
import TmdbMovieIdentifier from './identifiers/TmdbMovieidentifier';
import { Movie } from '../../../models/movie';

export default class MovieIndexer {
    /**
     *
     * @param {Oblecto} oblecto
     */
    constructor(oblecto) {
        this.oblecto = oblecto;

        this.movieIdentifer = new AggregateIdentifier();

        this.movieIdentifer.loadIdentifier(new TmdbMovieIdentifier(this.oblecto));

        // Register task availability to Oblecto queue
        this.oblecto.queue.addJob('indexMovie', async (job) => await this.indexFile(job.path, job.doReIndex));
    }

    async indexFile(moviePath) {
        let file = await this.oblecto.fileIndexer.indexVideoFile(moviePath);

        let movieIdentification = await this.movieIdentifer.identify(moviePath);

        let [movie, movieCreated] = await Movie.findOrCreate(
            {
                where: {
                    tmdbid: movieIdentification.tmdbid
                },
                defaults: movieIdentification
            });

        movie.addFile(file);

        if (!movieCreated) return;

        this.oblecto.queue.queueJob('updateMovie', movie);
        this.oblecto.queue.queueJob('downloadMovieFanart', movie);
        this.oblecto.queue.pushJob('downloadMoviePoster', movie);
    }
}
