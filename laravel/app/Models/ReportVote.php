<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReportVote extends Model
{
    use HasFactory;

    public const VERDICTS = ['confirm', 'dispute'];

    protected $fillable = [
        'report_id',
        'user_id',
        'verdict',
        'comment',
    ];

    public function report()
    {
        return $this->belongsTo(Report::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
