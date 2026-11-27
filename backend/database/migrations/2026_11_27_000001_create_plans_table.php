<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('content')->nullable();
            $table->date('plan_date')->nullable();
            $table->boolean('is_pinned')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'is_pinned', 'plan_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plans');
    }
};
