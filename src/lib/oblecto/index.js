import TVDB from 'node-tvdb';
import moviedb from 'moviedb-promise';

import Queue from '../queue';
import SeriesIndexer from '../indexers/series/SeriesIndexer';
import MovieIndexer from '../indexers/movies/MovieIndexer';

import SeriesCollector from '../indexers/series/SeriesCollector';
import MovieCollector from '../indexers/movies/MovieCollector';

import OblectoAPI from '../../submodules/REST';
import RealtimeController from '../realtime/RealtimeController';

import ArtworkUtils from '../artwork/ArtworkUtils';
import MovieArtworkCollector from '../artwork/movies/MovieArtworkCollector';
import SeriesArtworkCollector from '../artwork/series/SeriesArtworkCollector';
import Downloader from '../downloader';

import SeriesArtworkDownloader from '../artwork/series/SeriesArtworkDownloader';
import MovieArtworkDownloader from '../artwork/movies/MovieArtworkDownloader';

import ImageScaler from '../artwork/ArtworkScaler';

import SeriesUpdater from '../updaters/series/SeriesUpdater';
import MovieUpdater from '../updaters/movies/MovieUpdater';

import SeriesUpdateCollector from '../updaters/series/SeriesUpdateCollector';
import FederationController from '../federation/server/FederationController';
import FederationClientController from '../federation/client/FederationClientController';
import MovieUpdateCollector from '../updaters/movies/MovieUpdateCollector';
import FederationEpisodeIndexer from '../federationindexer/FederationEpisodeIndexer';
import FederationMovieIndexer from '../federationindexer/FederationMovieIndexer';

export default class Oblecto {
    constructor(config) {
        this.config = config;

        this.tvdb = new TVDB(this.config.tvdb.key);
        this.tmdb = new moviedb(this.config.themoviedb.key);

        this.queue = new Queue(this.config.queue.concurrency);

        this.oblectoAPI = new OblectoAPI(this);
        this.realTimeController = new RealtimeController(this);

        this.seriesIndexer = new SeriesIndexer(this);
        this.movieIndexer = new MovieIndexer(this);

        this.seriesCollector = new SeriesCollector(this);
        this.movieCollector = new MovieCollector(this);

        this.seriesArtworkDownloader = new SeriesArtworkDownloader(this);
        this.movieArtworkDownloader = new MovieArtworkDownloader(this);

        this.movieArtworkCollector = new MovieArtworkCollector(this);
        this.seriesArtworkCollector = new SeriesArtworkCollector(this);
        this.artworkUtils = new ArtworkUtils(this);
        this.imageScaler = new ImageScaler(this);

        this.seriesUpdater = new SeriesUpdater(this);
        this.movieUpdater = new MovieUpdater(this);

        this.seriesUpdateCollector = new SeriesUpdateCollector(this);
        this.movieUpdateCollector = new MovieUpdateCollector(this);

        if (config.federation.enabled) {
            this.fedartionController = new FederationController(this);
            this.federationClientController = new FederationClientController(this);

            this.federationEpisodeIndexer = new FederationEpisodeIndexer(this);
            this.federationMovieIndexer = new FederationMovieIndexer(this);
        }


        this.setupQueue();
    }

    setupQueue () {
        this.queue.addJob('downloadFile', async (job) => {
            await Downloader.download(job.url, job.dest, job.overwrite);
        });
    }
}
